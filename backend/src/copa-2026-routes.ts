import { Router } from 'express';
import { translateCountry } from './country-names';
import { getDb } from './mongodb';
import { espnCopaUrl } from './constants';

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
const COPA_JOGOS_TTL_MS = 5 * 60_000; // 5min — populate roda a cada 6h, cache curto garante dados frescos

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

async function fetchCopaJogosMongo(): Promise<any[]> {
  const mdb = await getDb();
  const docs = await mdb.collection('jogos').find({ campeonato: 'Copa do Mundo 2026' }).toArray();
  return docs.map(d => ({
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
  })).sort((a, b) => a.data.localeCompare(b.data) || a.hora.localeCompare(b.hora));
}

router.get('/api/copa-2026/jogos', async (_req, res) => {
  const agora = Date.now();
  if (copaJogosCache && agora - copaJogosCache.fetchedAt < COPA_JOGOS_TTL_MS) {
    // edge cache de 6h garante ≤4 leituras/dia no Firestore
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    res.json(copaJogosCache.dados);
    return;
  }
  try {
    const jogos = await fetchCopaJogosMongo();
    copaJogosCache = { dados: jogos, fetchedAt: agora };
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    res.json(jogos);
  } catch (error) {
    console.error('Erro ao buscar jogos Copa 2026 do MongoDB:', error);
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

// ── Admin: limpar + repopulate Copa (uso único via curl/browser no Vercel) ────
function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

router.post('/api/admin/repopulate-copa', async (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (!process.env['ADMIN_SECRET'] || secret !== process.env['ADMIN_SECRET']) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const mdb = await getDb();

    // 1. Apagar todos os docs Copa existentes
    const delResult = await mdb.collection('jogos').deleteMany({ campeonato: 'Copa do Mundo 2026' });

    // 2. Buscar fixtures da ESPN (período completo da Copa: 11 Jun–19 Jul)
    const url = espnCopaUrl();
    const espnResp = await fetch(url);
    if (!espnResp.ok) throw new Error(`ESPN ${espnResp.status}`);
    const data: any = await espnResp.json();

    const agora = new Date().toISOString();
    const bulkOps: any[] = [];

    for (const event of data.events ?? []) {
      const comp = event.competitions?.[0];
      if (!comp) continue;
      const mand  = comp.competitors?.find((c: any) => c.homeAway === 'home');
      const visit = comp.competitors?.find((c: any) => c.homeAway === 'away');
      if (!mand || !visit) continue;

      const brt = new Date(new Date(event.date).getTime() - 3 * 60 * 60 * 1000);
      const timeMandante  = translateCountry(mand.team.displayName);
      const timeVisitante = translateCountry(visit.team.displayName);
      const dataStr = brt.toISOString().slice(0, 10);
      const id = `copa26-${dataStr}-${slugify(timeMandante)}-${slugify(timeVisitante)}`;

      bulkOps.push({
        updateOne: {
          filter: { _id: id } as any,
          update: {
            $set: {
              rodada: 0, timeMandante, timeVisitante,
              logoMandante:  mand.team.logo ?? '',
              logoVisitante: visit.team.logo ?? '',
              data: dataStr,
              hora: brt.toISOString().slice(11, 16),
              canal: [], streaming: ['CazéTV', 'Prime Video'],
              estadio: comp.venue?.fullName ?? '',
              campeonato: 'Copa do Mundo 2026',
              lastUpdated: agora,
            },
          },
          upsert: true,
        },
      });
    }

    if (bulkOps.length > 0) await mdb.collection('jogos').bulkWrite(bulkOps);
    copaJogosCache = null; // invalida cache em memória

    res.json({ deleted: delResult.deletedCount, inserted: bulkOps.length });
  } catch (err: any) {
    console.error('repopulate-copa error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Invalida apenas o cache em memória (sem tocar no Firestore).
// Chamado pelo GH Actions após o populate para que o servidor veja dados frescos imediatamente.
router.post('/api/admin/invalidar-cache-copa', (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (!process.env['ADMIN_SECRET'] || secret !== process.env['ADMIN_SECRET']) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  copaJogosCache = null;
  res.json({ ok: true, message: 'Cache de jogos Copa invalidado' });
});

export default router;
