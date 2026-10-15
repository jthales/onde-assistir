import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Jogo } from './types';
import { getMessaging } from './firebase';
import { getDb } from './mongodb';
import { espnScoreboardUrlForLeague, espnCopaUrl, ESPN_LEAGUES, TEAM_NAME_MAP, TEAM_ESPN_ID_MAP, LIGA_SLUG_TO_ESPN, LIGA_SLUG_LABEL } from './constants';
import copa2026Router from './copa-2026-routes';
const app = express();
const PORT = process.env['PORT'] ?? 3000;

app.use(cors({
  origin: [
    'http://localhost:4200',
    'https://onde-assistir-five.vercel.app',
    'http://ondeassistir.space',
    'https://ondeassistir.space',
  ],
}));
app.use(express.json());

app.use('/api/', rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em breve.' },
}));

app.use(copa2026Router);

let jogosCache: { dados: Jogo[]; fetchedAt: number } | null = null;
const JOGOS_CACHE_TTL_MS = 6 * 60 * 60_000; // 6h — jogos da semana mudam só via populate

app.get('/api/jogos', async (_req, res) => {
  const agora = Date.now();
  if (jogosCache && agora - jogosCache.fetchedAt < JOGOS_CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=43200');
    res.json(jogosCache.dados);
    return;
  }

  try {
    const hojeStr = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const mdb = await getDb();
    const docs = await mdb.collection('jogos').find({ data: { $gte: hojeStr } }).toArray();

    const jogos: Jogo[] = docs.map((d) => ({
      rodada: d['rodada'],
      timeMandante: d['timeMandante'],
      timeVisitante: d['timeVisitante'],
      logoMandante: d['logoMandante'] ?? '',
      logoVisitante: d['logoVisitante'] ?? '',
      data: d['data'],
      hora: d['hora'],
      canal: d['canal'] ?? [],
      streaming: d['streaming'] ?? [],
      estadio: d['estadio'] ?? '',
      campeonato: d['campeonato'] ?? '',
    }));

    jogosCache = { dados: jogos, fetchedAt: Date.now() };
    res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=43200');
    res.json(jogos);
  } catch (error) {
    console.error('Erro ao buscar jogos do Firestore:', error);
    if (jogosCache) { res.json(jogosCache.dados); return; }
    res.status(500).json({ error: 'Falha ao buscar jogos' });
  }
});

// Invalida apenas o cache em memória (sem tocar no banco).
// Chamado pelo GH Actions após o populate para que o servidor veja dados frescos imediatamente.
app.post('/api/admin/invalidar-cache', (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (!process.env['ADMIN_SECRET'] || secret !== process.env['ADMIN_SECRET']) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  jogosCache = null;
  jogosCampeonatoCache.clear();
  res.json({ ok: true, message: 'Cache de jogos invalidado' });
});

// ── Endpoint de teste de push (remover após validação) ───────────────────────

app.post('/api/test-push', async (req, res) => {
  const { titulo, corpo } = req.body ?? {};
  try {
    const mdb = await getDb();
    const subscDocs = await mdb.collection('subscricoes').find().toArray();
    if (subscDocs.length === 0) { res.json({ ok: true, enviados: 0, msg: 'Nenhum assinante cadastrado' }); return; }
    const tokens = subscDocs.map(d => d['fcmToken'] as string).filter(Boolean);
    if (tokens.length === 0) { res.json({ ok: true, enviados: 0 }); return; }
    const result = await getMessaging().sendEachForMulticast({
      tokens,
      notification: {
        title: titulo ?? '⚽ GOL! (teste)',
        body: corpo ?? 'Flamengo 1 x 0 Palmeiras — Notificação de teste',
      },
      webpush: {
        notification: { icon: '/favicon/icon-512x512.svg', tag: 'teste-push' },
        fcmOptions: { link: '/' },
      },
    });
    res.json({ ok: true, enviados: result.successCount, falhas: result.failureCount });
  } catch (e: any) {
    console.error('Erro no test-push:', e);
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

// ── Subscrições FCM ─────────────────────────────────────────────────────────

app.post('/api/subscricao', async (req, res) => {
  const { fcmToken, times, jogos } = req.body ?? {};
  if (!fcmToken || typeof fcmToken !== 'string') {
    res.status(400).json({ error: 'fcmToken obrigatório' });
    return;
  }
  try {
    const mdb = await getDb();
    await mdb.collection('subscricoes').updateOne(
      { _id: fcmToken } as any,
      { $set: { fcmToken, times: times ?? [], jogos: jogos ?? [], updatedAt: new Date() } },
      { upsert: true },
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('Erro ao salvar subscrição:', e);
    res.status(500).json({ error: 'Falha ao salvar subscrição' });
  }
});

app.delete('/api/subscricao/:token', async (req, res) => {
  const token = req.params['token'];
  try {
    const mdb = await getDb();
    await mdb.collection('subscricoes').deleteOne({ _id: token } as any);
    res.json({ ok: true });
  } catch (e) {
    console.error('Erro ao remover subscrição:', e);
    res.status(500).json({ error: 'Falha ao remover subscrição' });
  }
});

// ── Estado de placares para detecção de gols (Fase 4) ───────────────────────
const estadoPlacarMemoria = new Map<string, { mandante: number; visitante: number }>();
let estadoPlacarInicializado = false;

async function dispararNotificacoesGol(placares: any[]): Promise<void> {
  for (const p of placares) {
    if (p.status !== 'em-andamento') continue;
    if (p.placarMandante == null || p.placarVisitante == null) continue;

    const key = `${p.data}_${p.timeMandante}_${p.timeVisitante}`;
    const prev = estadoPlacarMemoria.get(key);
    const totalNovo = p.placarMandante + p.placarVisitante;
    const totalPrev = prev ? prev.mandante + prev.visitante : 0;

    // Só atualiza estado se o placar não diminuiu — evita glitch da ESPN resetar o estado
    if (!prev || totalNovo >= totalPrev) {
      estadoPlacarMemoria.set(key, { mandante: p.placarMandante, visitante: p.placarVisitante });
    }

    if (!estadoPlacarInicializado || !prev || totalNovo <= totalPrev) continue;

    // Detectou gol — deduplicar via MongoDB antes de enviar (protege contra múltiplas instâncias/reinicializações)
    const golKey = `${key}_${p.placarMandante}x${p.placarVisitante}`;
    let golJaExistia: any;
    try {
      const mdbGol = await getDb();
      golJaExistia = await mdbGol.collection('gols-notificados').findOneAndUpdate(
        { _id: golKey } as any,
        { $setOnInsert: { sentAt: new Date().toISOString(), placar: `${p.placarMandante}x${p.placarVisitante}` } } as any,
        { upsert: true, returnDocument: 'before' },
      );
    } catch (e) {
      console.error('[FCM] Erro na deduplicação, pulando notificação para evitar duplicata:', e);
      continue;
    }
    if (golJaExistia !== null) {
      console.log(`[FCM] Gol ${golKey} já notificado, ignorando duplicata`);
      continue;
    }

    // Buscar assinantes relevantes
    const jogoKey = key;
    try {
      const mdbSub = await getDb();
      const subscDocs = await mdbSub.collection('subscricoes').find().toArray();
      const tokens: string[] = [];
      for (const doc of subscDocs) {
        const sub = doc;
        const relevante =
          (sub['times'] as string[])?.includes(p.timeMandante) ||
          (sub['times'] as string[])?.includes(p.timeVisitante) ||
          (sub['jogos'] as string[])?.includes(jogoKey);
        if (relevante && sub['fcmToken']) tokens.push(sub['fcmToken'] as string);
      }
      const uniqueTokens = [...new Set(tokens)];
      if (uniqueTokens.length === 0) continue;

      const timeQueGolou = p.placarMandante > (prev?.mandante ?? 0) ? p.timeMandante : p.timeVisitante;
      const body = `${p.timeMandante} ${p.placarMandante} x ${p.placarVisitante} ${p.timeVisitante}`;
      const result = await getMessaging().sendEachForMulticast({
        tokens: uniqueTokens,
        notification: {
          title: `⚽ GOL! ${timeQueGolou}`,
          body,
        },
        webpush: {
          notification: {
            icon: '/favicon/icon-512x512.svg',
            tag: `gol-${p.timeMandante}-${p.timeVisitante}`,
          },
          fcmOptions: { link: '/' },
        },
      });

      // Remover tokens inválidos
      const tokensInvalidos = result.responses
        .map((r: any, i: number) => (!r.success ? uniqueTokens[i] : null))
        .filter(Boolean) as string[];
      for (const t of tokensInvalidos) {
        getDb().then(mdb => mdb.collection('subscricoes').deleteOne({ _id: t } as any)).catch(() => {});
      }
    } catch (e) {
      console.error('Erro ao enviar FCM para gol:', e);
    }
  }

  estadoPlacarInicializado = true;
}

// ── Cache em memória — máx 2 chamadas/min à ESPN ─────────────────────────────
let placarCache: { dados: any[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 10_000;

// Persistência de resultados finais no Firestore
function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function slugifyFull(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function resultadoDocId(data: string, mandante: string, visitante: string): string {
  return `${data}-${slugify(mandante)}-${slugify(visitante)}`;
}

let resultadosCache: any[] = [];
let resultadosCacheTime = 0;
const RESULTADOS_TTL_MS = 60_000;
const jogosJaSalvos = new Set<string>();

async function getSavedResultados(): Promise<any[]> {
  if (Date.now() - resultadosCacheTime < RESULTADOS_TTL_MS) return resultadosCache;
  try {
    const mdb = await getDb();
    const docs = await mdb.collection('resultados').find().toArray();
    resultadosCache = docs.map(({ _id, ...rest }) => rest);
    resultadosCacheTime = Date.now();
  } catch (e) {
    console.error('Erro ao ler resultados do MongoDB:', e);
  }
  return resultadosCache;
}

async function salvarResultado(placar: any): Promise<void> {
  const id = resultadoDocId(placar.data, placar.timeMandante, placar.timeVisitante);
  if (jogosJaSalvos.has(id)) return;
  jogosJaSalvos.add(id);
  try {
    const mdb = await getDb();
    await mdb.collection('resultados').updateOne(
      { _id: id } as any,
      { $set: { ...placar, savedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() } },
      { upsert: true },
    );
    resultadosCacheTime = 0; // invalida cache para próxima leitura
  } catch (e) {
    jogosJaSalvos.delete(id); // permite retry em caso de falha
    console.error('Erro ao salvar resultado:', e);
  }
}

app.get('/api/placar', async (_req, res) => {
  const agora = Date.now();

  if (placarCache && agora - placarCache.fetchedAt < CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=20');
    res.json(placarCache.dados);
    return;
  }

  try {
    const [dataBra, dataLib, dataSul, dataCopa, dataCopa2026] = await Promise.all([
      fetch(espnScoreboardUrlForLeague(ESPN_LEAGUES.brasileirao, 1)).then(r => r.json()),
      fetch(espnScoreboardUrlForLeague(ESPN_LEAGUES.libertadores, 1)).then(r => r.json()),
      fetch(espnScoreboardUrlForLeague(ESPN_LEAGUES.sudamericana, 1)).then(r => r.json()),
      fetch(espnScoreboardUrlForLeague(ESPN_LEAGUES.copadobrasil, 1)).then(r => r.json()),
      fetch(espnCopaUrl()).then(r => r.json()),
    ]);
    const allEvents = [
      ...(dataBra.events ?? []),
      ...(dataLib.events ?? []),
      ...(dataSul.events ?? []),
      ...(dataCopa.events ?? []),
      ...(dataCopa2026.events ?? []),
    ];

    const placares = allEvents.map((event: any) => {
      const comp = event.competitions?.[0];
      const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
      const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');

      const statusName: string = event.status?.type?.name ?? '';
      const statusState: string = event.status?.type?.state ?? 'pre';
      const statusCompleted: boolean = event.status?.type?.completed === true;
      const status: 'em-andamento' | 'encerrado' | 'agendado' =
        (statusCompleted || statusState === 'post') ? 'encerrado' :
        statusState === 'in'                        ? 'em-andamento' :
                                                      'agendado';

      const brtDate = new Date(new Date(event.date).getTime() - 3 * 60 * 60 * 1000);
      const dataJogo = brtDate.toISOString().slice(0, 10); // data BRT (não UTC)

      const gols = (comp?.details ?? [])
        .filter((d: any) => d.scoringPlay === true)
        .map((d: any) => {
          const scorer = d.athletesInvolved?.[0];
          const teamId = d.team?.id;
          const isHome = home?.team?.id === teamId;
          return {
            nome:    scorer?.shortName ?? scorer?.displayName ?? 'Desconhecido',
            time:    isHome ? 'mandante' : 'visitante',
            minuto:  d.clock?.displayValue ?? '',
            penalti: d.penaltyKick === true,
            contra:  d.ownGoal === true,
          };
        });

      return {
        timeMandante:    TEAM_NAME_MAP[home?.team?.displayName] ?? home?.team?.displayName ?? '',
        timeVisitante:   TEAM_NAME_MAP[away?.team?.displayName] ?? away?.team?.displayName ?? '',
        data:            dataJogo,
        placarMandante:  home?.score != null ? Number(home.score) : null,
        placarVisitante: away?.score != null ? Number(away.score) : null,
        status,
        tempo:           event.status?.displayClock ?? undefined,
        periodo:         (statusName === 'Halftime' || statusName === 'STATUS_HALFTIME') ? 'Intervalo'
                       : event.status?.period   ? `${event.status.period}T`
                       : undefined,
        gols,
      };
    });

    // Salvar resultados encerrados no Firestore (fire-and-forget)
    for (const p of placares) {
      if (p.status === 'encerrado') salvarResultado(p);
    }

    // Detectar gols e enviar FCM (fire-and-forget)
    dispararNotificacoesGol(placares).catch(() => {});

    // Mesclar com resultados salvos: ESPN tem prioridade
    const savedResultados = await getSavedResultados();
    const espnKeys = new Set(placares.map((p: any) => `${p.data}_${p.timeMandante}_${p.timeVisitante}`));
    const extras = savedResultados.filter(
      r => !espnKeys.has(`${r.data}_${r.timeMandante}_${r.timeVisitante}`)
    );
    const merged = [...placares, ...extras];

    placarCache = { dados: merged, fetchedAt: Date.now() };
    res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=20');
    res.json(merged);
  } catch (error) {
    console.error('Erro ao buscar placares da ESPN:', error);
    if (placarCache) { res.json(placarCache.dados); return; }
    res.status(500).json({ error: 'Falha ao buscar placares' });
  }
});

// Cache de odds — atualiza a cada 5 minutos
let oddsCache: { dados: any[]; fetchedAt: number } | null = null;
const ODDS_CACHE_TTL_MS = 10_000;

app.get('/api/odds', async (_req, res) => {
  const agora = Date.now();

  if (oddsCache && agora - oddsCache.fetchedAt < ODDS_CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=20');
    res.json(oddsCache.dados);
    return;
  }

  try {
    const ligas = [
      ESPN_LEAGUES.brasileirao,
      ESPN_LEAGUES.libertadores,
      ESPN_LEAGUES.sudamericana,
      ESPN_LEAGUES.copadobrasil,
    ];

    const ligaResults = await Promise.allSettled(
      ligas.map(leagueId =>
        fetch(espnScoreboardUrlForLeague(leagueId, 1))
          .then(r => r.json())
          .then((data: any) => ({ leagueId, events: (data.events ?? []) as any[] }))
      )
    );

    const allEvents: Array<{ leagueId: string; event: any }> = [];
    for (const result of ligaResults) {
      if (result.status === 'fulfilled') {
        const { leagueId, events } = result.value;
        for (const event of events) allEvents.push({ leagueId, event });
      }
    }

    const oddsResults = await Promise.allSettled(
      allEvents.map(async ({ leagueId, event }) => {
        const comp = event.competitions?.[0];
        const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
        const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
        const eventId = event.id;
        const compId = comp?.id ?? eventId;
        const brtDate = new Date(new Date(event.date).getTime() - 3 * 60 * 60 * 1000);
        const dataJogo = brtDate.toISOString().slice(0, 10);
        const base = {
          timeMandante:  TEAM_NAME_MAP[home?.team?.displayName] ?? home?.team?.displayName ?? '',
          timeVisitante: TEAM_NAME_MAP[away?.team?.displayName] ?? away?.team?.displayName ?? '',
          data: dataJogo,
        };

        try {
          const oddsResp = await fetch(
            `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueId}/events/${eventId}/competitions/${compId}/odds`
          );
          const oddsData: any = await oddsResp.json();
          const items: any[] = oddsData.items ?? [];

          // Ordena por prioridade do provider e pega o primeiro com odds decimais disponíveis
          const sorted = [...items].sort((a, b) => (a.provider?.priority ?? 99) - (b.provider?.priority ?? 99));
          let provider: any = null;
          for (const item of sorted) {
            if (
              item.homeTeamOdds?.current?.moneyLine?.decimal != null ||
              item.awayTeamOdds?.current?.moneyLine?.decimal != null ||
              item.current?.draw?.decimal != null
            ) {
              provider = item;
              break;
            }
          }

          return {
            ...base,
            provedor:  provider?.provider?.name ?? null,
            mandante:  provider?.homeTeamOdds?.current?.moneyLine?.decimal ?? null,
            empate:    provider?.current?.draw?.decimal ?? null,
            visitante: provider?.awayTeamOdds?.current?.moneyLine?.decimal ?? null,
          };
        } catch {
          return { ...base, provedor: null, mandante: null, empate: null, visitante: null };
        }
      })
    );

    const odds = oddsResults
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map(r => r.value);

    oddsCache = { dados: odds, fetchedAt: Date.now() };
    res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=20');
    res.json(odds);
  } catch (error) {
    console.error('Erro ao buscar odds:', error);
    if (oddsCache) { res.json(oddsCache.dados); return; }
    res.status(500).json({ error: 'Falha ao buscar odds' });
  }
});

// Cache de classificação — atualiza a cada 5 minutos
let classificacaoCache: { dados: any[]; fetchedAt: number } | null = null;
const CLASSIFICACAO_CACHE_TTL_MS = 5 * 60_000;

app.get('/api/classificacao', async (_req, res) => {
  const agora = Date.now();

  if (classificacaoCache && agora - classificacaoCache.fetchedAt < CLASSIFICACAO_CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.json(classificacaoCache.dados);
    return;
  }

  try {
    const resp = await fetch('https://site.api.espn.com/apis/v2/sports/soccer/bra.1/standings');
    const data: any = await resp.json();

    const entries = data.children?.[0]?.standings?.entries ?? [];
    const getStat = (stats: any[], name: string) =>
      stats?.find((s: any) => s.name === name)?.value ?? 0;

    const dados = entries.map((entry: any) => ({
      posicao:      getStat(entry.stats, 'rank'),
      nome:         TEAM_NAME_MAP[entry.team.displayName] ?? entry.team.displayName,
      logo:         entry.team.logos?.[0]?.href ?? null,
      jogos:        getStat(entry.stats, 'gamesPlayed'),
      vitorias:     getStat(entry.stats, 'wins'),
      empates:      getStat(entry.stats, 'ties'),
      derrotas:     getStat(entry.stats, 'losses'),
      gols:         getStat(entry.stats, 'pointsFor'),
      golsSofridos: getStat(entry.stats, 'pointsAgainst'),
      saldo:        getStat(entry.stats, 'pointDifferential'),
      pontos:       getStat(entry.stats, 'points'),
    }));

    classificacaoCache = { dados, fetchedAt: agora };
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.json(dados);
  } catch (error) {
    console.error('Erro ao buscar classificação:', error);
    if (classificacaoCache) { res.json(classificacaoCache.dados); return; }
    res.status(500).json({ error: 'Falha ao buscar classificação' });
  }
});

// ── Endpoints de campeonato (ESPN direto, sem Firestore) ─────────────────────

const FASE_SLUG_TO_PT: Record<string, string> = {
  'first-round':   'Primeira Fase',
  'second-round':  'Segunda Fase',
  'third-round':   'Terceira Fase',
  'fourth-round':  'Quarta Fase',
  'fifth-round':   'Quinta Fase',
  'round-of-16':   'Oitavas de Final',
  'quarterfinals': 'Quartas de Final',
  'semifinals':    'Semifinal',
  'final':         'Final',
};

const classificacaoCampeonatoCache = new Map<string, { dados: any; fetchedAt: number }>();

function parseLegJogo(event: any, home: any, away: any) {
  const comp = event.competitions?.[0];
  const statusState: string = event.status?.type?.state ?? 'pre';
  const statusCompleted: boolean = event.status?.type?.completed === true;
  const status = (statusCompleted || statusState === 'post') ? 'encerrado'
               : statusState === 'in' ? 'em-andamento' : 'agendado';
  const brt = new Date(new Date(event.date).getTime() - 3 * 60 * 60 * 1000);
  return {
    mandante:       TEAM_NAME_MAP[home?.team?.displayName] ?? home?.team?.displayName ?? '',
    logoMandante:   home?.team?.logo ?? null,
    visitante:      TEAM_NAME_MAP[away?.team?.displayName] ?? away?.team?.displayName ?? '',
    logoVisitante:  away?.team?.logo ?? null,
    data:           brt.toISOString().slice(0, 10),
    hora:           brt.toISOString().slice(11, 16),
    placarMandante: home?.score != null ? Number(home.score) : null,
    placarVisitante:away?.score != null ? Number(away.score) : null,
    status,
    estadio:        comp?.venue?.fullName ?? '',
  };
}

async function fetchMataMata(espnLeague: string) {
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const brtNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const passado = new Date(brtNow.getTime() - 30 * 24 * 60 * 60 * 1000);
  const futuro  = new Date(brtNow.getTime() + 60 * 24 * 60 * 60 * 1000);
  const base = `https://site.api.espn.com/apis/site/v2/sports/soccer/${espnLeague}/scoreboard`;

  const [respPass, respFut] = await Promise.all([
    fetch(`${base}?dates=${fmt(passado)}-${fmt(brtNow)}`),
    fetch(`${base}?dates=${fmt(brtNow)}-${fmt(futuro)}`),
  ]);
  if (!respPass.ok) throw new Error(`ESPN scoreboard error: ${respPass.status}`);
  if (!respFut.ok)  throw new Error(`ESPN scoreboard error: ${respFut.status}`);

  const [dataPass, dataFut] = await Promise.all([respPass.json(), respFut.json()]);
  const allEvents: any[] = [...(dataPass.events ?? []), ...(dataFut.events ?? [])];

  const seriesMap = new Map<string, any[]>();
  const seenEventIds = new Set<string>();
  for (const event of allEvents) {
    if (seenEventIds.has(event.id)) continue;
    seenEventIds.add(event.id);
    const comp = event.competitions?.[0];
    const sc = comp?.series?.competitors ?? [];
    if (sc.length < 2) continue;
    const key = sc.map((c: any) => String(c.id)).sort().join('-');
    if (!seriesMap.has(key)) seriesMap.set(key, []);
    seriesMap.get(key)!.push(event);
  }

  const confrontos: any[] = [];
  let faseAtual = '';

  for (const [, events] of seriesMap) {
    events.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const ev1 = events[0];
    const ev2 = events[1] ?? null;

    const comp1 = ev1.competitions?.[0];
    const home1 = comp1?.competitors?.find((c: any) => c.homeAway === 'home');
    const away1 = comp1?.competitors?.find((c: any) => c.homeAway === 'away');

    // time1 = mandante da ida, time2 = visitante da ida
    const time1Id = String(home1?.team?.id ?? '');
    const time2Id = String(away1?.team?.id ?? '');

    if (!faseAtual && ev1.season?.slug) {
      faseAtual = FASE_SLUG_TO_PT[ev1.season.slug] ?? ev1.season.slug;
    }

    let agregadoTime1: number | null = null;
    let agregadoTime2: number | null = null;
    let vencedor: 'time1' | 'time2' | null = null;

    if (ev2) {
      const comp2 = ev2.competitions?.[0];
      const sc2 = comp2?.series?.competitors ?? [];
      const sc2t1 = sc2.find((c: any) => String(c.id) === time1Id);
      const sc2t2 = sc2.find((c: any) => String(c.id) === time2Id);
      if (comp2?.series?.completed) {
        const winner = sc2.find((c: any) => c.winner);
        if (winner) vencedor = String(winner.id) === time1Id ? 'time1' : 'time2';
      }

      // Calcula agregado a partir dos placares das pernas (mais confiável, reflete ao vivo)
      const home2 = comp2?.competitors?.find((c: any) => c.homeAway === 'home');
      const away2 = comp2?.competitors?.find((c: any) => c.homeAway === 'away');
      const score1Ida   = home1?.score != null ? Number(home1.score) : null;
      const score2Ida   = away1?.score != null ? Number(away1.score) : null;
      const score2Volta = home2?.score != null ? Number(home2.score) : null;
      const score1Volta = away2?.score != null ? Number(away2.score) : null;
      if (score1Ida !== null && score1Volta !== null) {
        agregadoTime1 = score1Ida + score1Volta;
        agregadoTime2 = (score2Ida ?? 0) + (score2Volta ?? 0);
      } else if (sc2t1?.aggregateScore != null) {
        agregadoTime1 = sc2t1.aggregateScore;
        agregadoTime2 = sc2t2?.aggregateScore ?? null;
      }
    }

    confrontos.push({
      time1: { nome: TEAM_NAME_MAP[home1?.team?.displayName] ?? home1?.team?.displayName ?? '', logo: home1?.team?.logo ?? null },
      time2: { nome: TEAM_NAME_MAP[away1?.team?.displayName] ?? away1?.team?.displayName ?? '', logo: away1?.team?.logo ?? null },
      ida:   parseLegJogo(ev1, home1, away1),
      volta: ev2 ? parseLegJogo(ev2, ev2.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'home'), ev2.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'away')) : null,
      agregadoTime1,
      agregadoTime2,
      vencedor,
    });
  }

  // Ordena: confrontos com jogos mais próximos primeiro
  confrontos.sort((a, b) => {
    const da = a.ida?.data ?? a.volta?.data ?? '';
    const db2 = b.ida?.data ?? b.volta?.data ?? '';
    return da.localeCompare(db2);
  });

  return { tipo: 'mata-mata', faseAtual, confrontos, grupos: [] };
}

app.get('/api/classificacao/:liga', async (req, res) => {
  const liga = req.params['liga'];
  const espnLeague = LIGA_SLUG_TO_ESPN[liga];
  if (!espnLeague) { res.status(400).json({ error: 'Liga inválida' }); return; }

  const agora = Date.now();
  const cached = classificacaoCampeonatoCache.get(liga);
  if (cached && agora - cached.fetchedAt < CLASSIFICACAO_CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.json(cached.dados); return;
  }

  try {
    let resultado: any;

    if (liga === 'copa-do-brasil') {
      resultado = await fetchMataMata(espnLeague);
    } else {
      const resp = await fetch(`https://site.api.espn.com/apis/v2/sports/soccer/${espnLeague}/standings`);
      const data: any = await resp.json();
      const children: any[] = data.children ?? [];
      const getStat = (stats: any[], name: string) => stats?.find((s: any) => s.name === name)?.value ?? 0;

      const grupos = children.map((child: any) => ({
        nome: child.name ?? child.abbreviation ?? 'Grupo',
        times: (child.standings?.entries ?? []).map((entry: any) => ({
          posicao:      getStat(entry.stats, 'rank'),
          nome:         TEAM_NAME_MAP[entry.team.displayName] ?? entry.team.displayName,
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
      resultado = { tipo: children.length === 1 ? 'tabela-unica' : 'grupos', grupos };
    }

    classificacaoCampeonatoCache.set(liga, { dados: resultado, fetchedAt: agora });
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.json(resultado);
  } catch (error) {
    console.error(`Erro ao buscar classificação de ${liga}:`, error);
    const cached = classificacaoCampeonatoCache.get(liga);
    if (cached) { res.json(cached.dados); return; }
    res.status(500).json({ error: 'Falha ao buscar classificação' });
  }
});

const jogosCampeonatoCache = new Map<string, { dados: any[]; fetchedAt: number }>();
const JOGOS_CAMP_CACHE_TTL_MS = 15 * 60_000;

app.get('/api/jogos-campeonato/:liga', async (req, res) => {
  const liga = req.params['liga'];
  const espnLeague = LIGA_SLUG_TO_ESPN[liga];
  if (!espnLeague) { res.status(400).json({ error: 'Liga inválida' }); return; }

  const agora = Date.now();
  const cached = jogosCampeonatoCache.get(liga);
  if (cached && agora - cached.fetchedAt < JOGOS_CAMP_CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
    res.json(cached.dados); return;
  }

  try {
    const resp = await fetch(espnScoreboardUrlForLeague(espnLeague, 14));
    const data: any = await resp.json();
    const events: any[] = data.events ?? [];

    const jogos = events.map((event: any) => {
      const comp = event.competitions?.[0];
      const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
      const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
      const statusState: string = event.status?.type?.state ?? 'pre';
      const statusCompleted: boolean = event.status?.type?.completed === true;
      const status = (statusCompleted || statusState === 'post') ? 'encerrado'
                   : statusState === 'in' ? 'em-andamento' : 'agendado';
      const brtDate = new Date(new Date(event.date).getTime() - 3 * 60 * 60 * 1000);
      return {
        timeMandante:    TEAM_NAME_MAP[home?.team?.displayName] ?? home?.team?.displayName ?? '',
        timeVisitante:   TEAM_NAME_MAP[away?.team?.displayName] ?? away?.team?.displayName ?? '',
        logoMandante:    home?.team?.logo ?? home?.team?.logos?.[0]?.href ?? null,
        logoVisitante:   away?.team?.logo ?? away?.team?.logos?.[0]?.href ?? null,
        data:            brtDate.toISOString().slice(0, 10),
        hora:            brtDate.toISOString().slice(11, 16),
        status,
        rodada:          event.week?.number ?? null,
        fase:            FASE_SLUG_TO_PT[event.season?.slug] ?? event.season?.slug ?? null,
        placarMandante:  home?.score != null ? Number(home.score) : null,
        placarVisitante: away?.score != null ? Number(away.score) : null,
        estadio:         comp?.venue?.fullName ?? '',
        campeonato:      LIGA_SLUG_LABEL[liga] ?? liga,
      };
    });

    jogosCampeonatoCache.set(liga, { dados: jogos, fetchedAt: agora });
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
    res.json(jogos);
  } catch (error) {
    console.error(`Erro ao buscar jogos de ${liga}:`, error);
    const cached = jogosCampeonatoCache.get(liga);
    if (cached) { res.json(cached.dados); return; }
    res.status(500).json({ error: 'Falha ao buscar jogos' });
  }
});

app.get('/api/noticias-campeonato/:liga', async (req, res) => {
  const liga = req.params['liga'];
  const espnLeague = LIGA_SLUG_TO_ESPN[liga];
  if (!espnLeague) { res.json([]); return; }

  const cacheKey = `camp:${liga}`;
  const agora = Date.now();
  const cached = noticiasCache.get(cacheKey);
  if (cached && agora - cached.fetchedAt < NOTICIAS_CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
    res.json(cached.dados); return;
  }

  try {
    const resp = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${espnLeague}/news?limit=3&lang=pt&region=br`
    );
    const data: any = await resp.json();
    const noticias: Noticia[] = (data.articles ?? []).map((article: any) => ({
      titulo:      article.headline ?? '',
      descricao:   article.description ?? '',
      imagem:      article.images?.[0]?.url ?? '',
      link:        article.links?.web?.href ?? '',
      publicadoEm: article.published ?? '',
    }));
    noticiasCache.set(cacheKey, { dados: noticias, fetchedAt: agora });
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
    res.json(noticias);
  } catch (error) {
    console.error(`Erro ao buscar notícias de ${liga}:`, error);
    res.json([]);
  }
});

const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'https://ondeassistir.space';

app.get('/og', async (req, res) => {
  const slug = String(req.query['time'] ?? '').toLowerCase();

  let title = 'Onde Assistir — Jogos de futebol da semana no Brasil';
  let description = 'Veja onde assistir os jogos de futebol desta semana no Brasil.';
  let imageUrl = `${FRONTEND_URL}/favicon/android-icon-192x192.png`;
  let canonicalUrl = FRONTEND_URL;

  try {
    const hojeStrOg = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const mdbOg = await getDb();
    const ogDocs = await mdbOg.collection('jogos').find({ data: { $gte: hojeStrOg } }).toArray();
    const jogos: Jogo[] = ogDocs.map(d => ({
      rodada: d['rodada'],
      timeMandante: d['timeMandante'],
      timeVisitante: d['timeVisitante'],
      logoMandante: d['logoMandante'] ?? '',
      logoVisitante: d['logoVisitante'] ?? '',
      data: d['data'],
      hora: d['hora'],
      canal: d['canal'] ?? [],
      streaming: d['streaming'] ?? [],
      estadio: d['estadio'] ?? '',
      campeonato: d['campeonato'] ?? '',
    }));

    const now = new Date();

    if (slug) {
      const timesJogos = jogos.filter(j =>
        slugifyFull(j.timeMandante) === slug || slugifyFull(j.timeVisitante) === slug
      );
      const nomeTime = timesJogos[0]
        ? (slugifyFull(timesJogos[0].timeMandante) === slug ? timesJogos[0].timeMandante : timesJogos[0].timeVisitante)
        : slug;

      const proximos = timesJogos
        .filter(j => new Date(`${j.data}T${j.hora || '23:59'}:00-03:00`) >= now)
        .sort((a, b) => a.data.localeCompare(b.data));

      const proximo = proximos[0];
      canonicalUrl = `${FRONTEND_URL}/${slug}`;
      title = `${nomeTime} — Onde Assistir`;

      if (proximo) {
        const adversario = slugifyFull(proximo.timeMandante) === slug
          ? proximo.timeVisitante : proximo.timeMandante;
        const canais = [...proximo.canal, ...proximo.streaming].join(', ') || 'A confirmar';
        const [, m, d] = proximo.data.split('-');
        const dataFmt = `${d}/${m}`;
        description = `${nomeTime} x ${adversario} em ${dataFmt}. Assista em: ${canais}.`;
        if (proximo.logoMandante || proximo.logoVisitante) {
          imageUrl = (slugifyFull(proximo.timeMandante) === slug
            ? proximo.logoMandante : proximo.logoVisitante) || imageUrl;
        }
      } else {
        description = `Veja todos os jogos do ${nomeTime} desta semana e onde assistir.`;
      }
    }
  } catch (e) {
    console.error('Erro ao gerar OG para', slug, e);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=7200');
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(imageUrl)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
  <meta http-equiv="refresh" content="0; url=${escapeHtml(canonicalUrl)}" />
</head>
<body>
  <p>Redirecionando para <a href="${escapeHtml(canonicalUrl)}">${escapeHtml(canonicalUrl)}</a>...</p>
</body>
</html>`);
});

// Cache de notícias — 10 minutos por time
interface Noticia {
  titulo: string;
  descricao: string;
  imagem: string;
  link: string;
  publicadoEm: string;
}
const noticiasCache = new Map<string, { dados: Noticia[]; fetchedAt: number }>();
const NOTICIAS_CACHE_TTL_MS = 10 * 60_000;

app.get('/api/noticias/:timeSlug', async (req, res) => {
  const timeSlug = req.params['timeSlug'];
  const teamId = TEAM_ESPN_ID_MAP[timeSlug];

  if (!teamId) {
    res.json([]);
    return;
  }

  const agora = Date.now();
  const cached = noticiasCache.get(timeSlug);
  if (cached && agora - cached.fetchedAt < NOTICIAS_CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
    res.json(cached.dados);
    return;
  }

  try {
    const resp = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/news?team=${teamId}&limit=3&lang=pt&region=br`
    );
    const data: any = await resp.json();

    const noticias: Noticia[] = (data.articles ?? []).map((article: any) => ({
      titulo:      article.headline ?? '',
      descricao:   article.description ?? '',
      imagem:      article.images?.[0]?.url ?? '',
      link:        article.links?.web?.href ?? '',
      publicadoEm: article.published ?? '',
    }));

    noticiasCache.set(timeSlug, { dados: noticias, fetchedAt: agora });
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
    res.json(noticias);
  } catch (error) {
    console.error(`Erro ao buscar notícias para ${timeSlug}:`, error);
    res.json([]);
  }
});

app.get('/sitemap.xml', async (_req, res) => {
  try {
    const mdbSitemap = await getDb();
    const sitemapDocs = await mdbSitemap.collection('jogos').find().toArray();
    const times = new Set<string>();
    sitemapDocs.forEach(d => {
      if (d['timeMandante']) times.add(slugifyFull(d['timeMandante']));
      if (d['timeVisitante']) times.add(slugifyFull(d['timeVisitante']));
    });

    const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const urls = [
      `  <url><loc>${FRONTEND_URL}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      ...['brasileirao', 'libertadores', 'sul-americana'].map(slug =>
        `  <url><loc>${FRONTEND_URL}/campeonato/${slug}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>`
      ),
      ...[...times].sort().map(slug =>
        `  <url><loc>${FRONTEND_URL}/${slug}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`
      ),
    ].join('\n');

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=7200');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`);
  } catch (e) {
    console.error('Erro ao gerar sitemap:', e);
    res.status(500).send('Erro ao gerar sitemap');
  }
});

if (process.env['NODE_ENV'] !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
