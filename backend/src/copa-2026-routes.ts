import { Router } from 'express';
import { translateCountry } from './country-names';
import { db } from './firebase';

const router = Router();

const ESPN_COPA = 'fifa.world';

const COPA_FASE_TO_PT: Record<string, string> = {
  'group-stage':   'Fase de Grupos',
  'round-of-32':   'Primeira Fase Eliminatória',
  'round-of-16':   'Oitavas de Final',
  'quarterfinals': 'Quartas de Final',
  'semifinals':    'Semifinal',
  'third-place':   'Terceiro Lugar',
  'final':         'Final',
};

const ELIMINATORIAS_SLUGS = new Set([
  'round-of-32', 'round-of-16', 'quarterfinals', 'semifinals', 'third-place', 'final',
]);

let copaClassifCache: { dados: any; fetchedAt: number } | null = null;
const COPA_CLASSIF_TTL_MS = 5 * 60_000;

let copaJogosCache: { dados: any[]; fetchedAt: number } | null = null;
const COPA_JOGOS_TTL_MS = 2 * 60 * 60_000; // 2h

function fmt(d: Date) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function getStat(stats: any[], name: string): number {
  return stats?.find((s: any) => s.name === name)?.value ?? 0;
}

async function detectPhase(): Promise<string> {
  const brtNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const past = new Date(brtNow.getTime() - 3 * 24 * 60 * 60 * 1000);
  const future = new Date(brtNow.getTime() + 7 * 24 * 60 * 60 * 1000);
  const resp = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${ESPN_COPA}/scoreboard?dates=${fmt(past)}-${fmt(future)}`
  );
  if (!resp.ok) return 'group-stage';
  const data: any = await resp.json();
  const events: any[] = data.events ?? [];
  if (events.length === 0) return 'group-stage';
  // If any event in the window is in an elimination slug → elimination phase
  for (const ev of events) {
    const slug: string = ev.season?.slug ?? '';
    if (ELIMINATORIAS_SLUGS.has(slug)) return slug;
  }
  return events[0].season?.slug ?? 'group-stage';
}

async function fetchGrupos() {
  const resp = await fetch(`https://site.api.espn.com/apis/v2/sports/soccer/${ESPN_COPA}/standings`);
  if (!resp.ok) throw new Error(`ESPN standings ${resp.status}`);
  const data: any = await resp.json();
  const children: any[] = data.children ?? [];

  const grupos = children.map((child: any) => ({
    nome: (child.name ?? 'Grupo A').replace(/^Group\s+/i, 'Grupo '),
    times: ((child.standings?.entries ?? []) as any[]).map((entry: any) => ({
      posicao:      getStat(entry.stats, 'rank'),
      nome:         translateCountry(entry.team.displayName),
      logo:         entry.team.logos?.[0]?.href ?? null,
      jogos:        getStat(entry.stats, 'gamesPlayed'),
      vitorias:     getStat(entry.stats, 'wins'),
      empates:      getStat(entry.stats, 'ties'),
      derrotas:     getStat(entry.stats, 'losses'),
      gols:         getStat(entry.stats, 'pointsFor'),
      golsSofridos: getStat(entry.stats, 'pointsAgainst'),
      saldo:        getStat(entry.stats, 'pointDifferential'),
      pontos:       getStat(entry.stats, 'points'),
    })).sort((a: any, b: any) => a.posicao - b.posicao),
  }));

  return { tipo: 'grupos' as const, grupos, faseAtual: 'Fase de Grupos' };
}

async function fetchEliminatorias(phaseSlug: string) {
  const brtNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const past = new Date(brtNow.getTime() - 5 * 24 * 60 * 60 * 1000);
  const future = new Date(brtNow.getTime() + 14 * 24 * 60 * 60 * 1000);
  const resp = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${ESPN_COPA}/scoreboard?dates=${fmt(past)}-${fmt(future)}`
  );
  if (!resp.ok) throw new Error(`ESPN scoreboard ${resp.status}`);
  const data: any = await resp.json();
  const events: any[] = (data.events ?? []).filter((ev: any) => ELIMINATORIAS_SLUGS.has(ev.season?.slug ?? ''));

  const confrontos = events.map((event: any) => {
    const comp = event.competitions?.[0];
    const mand = (comp?.competitors ?? []).find((c: any) => c.homeAway === 'home');
    const visit = (comp?.competitors ?? []).find((c: any) => c.homeAway === 'away');

    const statusState: string = event.status?.type?.state ?? 'pre';
    const statusCompleted: boolean = event.status?.type?.completed === true;
    const status = (statusCompleted || statusState === 'post') ? 'encerrado'
                 : statusState === 'in' ? 'em-andamento' : 'agendado';

    const brt = new Date(new Date(event.date).getTime() - 3 * 60 * 60 * 1000);

    const vencedorTeamId = (comp?.competitors ?? []).find((c: any) => c.winner)?.team?.id;
    const mandTeamId = mand?.team?.id;
    const vencedor: 'time1' | 'time2' | null = vencedorTeamId
      ? (String(vencedorTeamId) === String(mandTeamId) ? 'time1' : 'time2')
      : null;

    return {
      time1:         { nome: translateCountry(mand?.team?.displayName ?? ''),  logo: mand?.team?.logo ?? null },
      time2:         { nome: translateCountry(visit?.team?.displayName ?? ''), logo: visit?.team?.logo ?? null },
      fase:          COPA_FASE_TO_PT[event.season?.slug] ?? event.season?.slug ?? '',
      ida: {
        mandante:        translateCountry(mand?.team?.displayName ?? ''),
        logoMandante:    mand?.team?.logo ?? null,
        visitante:       translateCountry(visit?.team?.displayName ?? ''),
        logoVisitante:   visit?.team?.logo ?? null,
        data:            brt.toISOString().slice(0, 10),
        hora:            brt.toISOString().slice(11, 16),
        placarMandante:  mand?.score  != null ? Number(mand.score)  : null,
        placarVisitante: visit?.score != null ? Number(visit.score) : null,
        status,
        estadio:         comp?.venue?.fullName ?? '',
      },
      volta:          null,
      agregadoTime1:  null,
      agregadoTime2:  null,
      vencedor,
    };
  });

  return {
    tipo:      'mata-mata' as const,
    faseAtual: COPA_FASE_TO_PT[phaseSlug] ?? phaseSlug,
    confrontos,
    grupos:    [],
  };
}

async function fetchCopaJogosFirestore(): Promise<any[]> {
  const snap = await db.collection('jogos')
    .where('campeonato', '==', 'Copa do Mundo 2026')
    .get();
  return snap.docs.map(doc => {
    const d = doc.data();
    return {
      rodada:        d['rodada'] ?? 0,
      timeMandante:  d['timeMandante'],
      timeVisitante: d['timeVisitante'],
      logoMandante:  d['logoMandante']  ?? '',
      logoVisitante: d['logoVisitante'] ?? '',
      data:          d['data'],
      hora:          d['hora'],
      canal:         d['canal']      ?? [],
      streaming:     d['streaming']  ?? [],
      estadio:       d['estadio']    ?? '',
      campeonato:    'Copa do Mundo 2026',
    };
  }).sort((a, b) => a.data.localeCompare(b.data) || a.hora.localeCompare(b.hora));
}

router.get('/api/copa-2026/jogos', async (_req, res) => {
  const agora = Date.now();
  if (copaJogosCache && agora - copaJogosCache.fetchedAt < COPA_JOGOS_TTL_MS) {
    // edge cache de 6h garante ≤4 leituras/dia no Firestore
    res.setHeader('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=14400');
    res.json(copaJogosCache.dados);
    return;
  }
  try {
    const jogos = await fetchCopaJogosFirestore();
    copaJogosCache = { dados: jogos, fetchedAt: agora };
    res.setHeader('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=14400');
    res.json(jogos);
  } catch (error) {
    console.error('Erro ao buscar jogos Copa 2026 do Firestore:', error);
    if (copaJogosCache) { res.json(copaJogosCache.dados); return; }
    res.status(500).json({ error: 'Falha ao buscar jogos da Copa 2026' });
  }
});

router.get('/api/copa-2026/classificacao', async (_req, res) => {
  const agora = Date.now();
  if (copaClassifCache && agora - copaClassifCache.fetchedAt < COPA_CLASSIF_TTL_MS) {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.json(copaClassifCache.dados);
    return;
  }

  try {
    const phase = await detectPhase();
    const resultado = ELIMINATORIAS_SLUGS.has(phase)
      ? await fetchEliminatorias(phase)
      : await fetchGrupos();

    copaClassifCache = { dados: resultado, fetchedAt: agora };
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.json(resultado);
  } catch (error) {
    console.error('Erro ao buscar classificação Copa 2026:', error);
    if (copaClassifCache) { res.json(copaClassifCache.dados); return; }
    res.status(500).json({ error: 'Falha ao buscar dados da Copa 2026' });
  }
});

export default router;
