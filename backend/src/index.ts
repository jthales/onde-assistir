import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Jogo } from './types';
import { db } from './firebase';
import { espnScoreboardUrl, TEAM_NAME_MAP } from './constants';
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

app.get('/api/jogos', async (_req, res) => {
  try {
    const snap = await db.collection('jogos').get();

    if (snap.empty) {
      res.json([]);
      return;
    }

    const jogos: Jogo[] = snap.docs.map((doc) => {
      const d = doc.data();
      return {
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
      };
    });

    res.json(jogos);
  } catch (error) {
    console.error('Erro ao buscar jogos do Firestore:', error);
    res.status(500).json({ error: 'Falha ao buscar jogos' });
  }
});

// Cache em memória — máx 2 chamadas/min à ESPN
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
    const snap = await db.collection('resultados').get();
    resultadosCache = snap.docs.map(d => d.data());
    resultadosCacheTime = Date.now();
  } catch (e) {
    console.error('Erro ao ler resultados do Firestore:', e);
  }
  return resultadosCache;
}

async function salvarResultado(placar: any): Promise<void> {
  const id = resultadoDocId(placar.data, placar.timeMandante, placar.timeVisitante);
  if (jogosJaSalvos.has(id)) return;
  jogosJaSalvos.add(id);
  try {
    await db.collection('resultados').doc(id).set({
      ...placar,
      savedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    });
    resultadosCacheTime = 0; // invalida cache para próxima leitura
  } catch (e) {
    jogosJaSalvos.delete(id); // permite retry em caso de falha
    console.error('Erro ao salvar resultado:', e);
  }
}

app.get('/api/placar', async (_req, res) => {
  const agora = Date.now();

  if (placarCache && agora - placarCache.fetchedAt < CACHE_TTL_MS) {
    res.json(placarCache.dados);
    return;
  }

  try {
    const resp = await fetch(espnScoreboardUrl());
    const data: any = await resp.json();

    const placares = (data.events ?? []).map((event: any) => {
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

    // Mesclar com resultados salvos: ESPN tem prioridade
    const savedResultados = await getSavedResultados();
    const espnKeys = new Set(placares.map((p: any) => `${p.data}_${p.timeMandante}_${p.timeVisitante}`));
    const extras = savedResultados.filter(
      r => !espnKeys.has(`${r.data}_${r.timeMandante}_${r.timeVisitante}`)
    );
    const merged = [...placares, ...extras];

    placarCache = { dados: merged, fetchedAt: Date.now() };
    res.json(merged);
  } catch (error) {
    console.error('Erro ao buscar placares da ESPN:', error);
    if (placarCache) { res.json(placarCache.dados); return; }
    res.status(500).json({ error: 'Falha ao buscar placares' });
  }
});

// Cache de odds — atualiza a cada 5 minutos
let oddsCache: { dados: any[]; fetchedAt: number } | null = null;
const ODDS_CACHE_TTL_MS = 5 * 60_000;

app.get('/api/odds', async (_req, res) => {
  const agora = Date.now();

  if (oddsCache && agora - oddsCache.fetchedAt < ODDS_CACHE_TTL_MS) {
    res.json(oddsCache.dados);
    return;
  }

  try {
    const resp = await fetch(espnScoreboardUrl());
    const data: any = await resp.json();
    const events: any[] = data.events ?? [];

    const oddsResults = await Promise.allSettled(
      events.map(async (event: any) => {
        const comp = event.competitions?.[0];
        const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
        const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
        const eventId = event.id;
        const compId = comp?.id ?? eventId;
        const brtDate = new Date(new Date(event.date).getTime() - 3 * 60 * 60 * 1000);
      const dataJogo = brtDate.toISOString().slice(0, 10); // data BRT (não UTC)
        const base = {
          timeMandante:  TEAM_NAME_MAP[home?.team?.displayName] ?? home?.team?.displayName ?? '',
          timeVisitante: TEAM_NAME_MAP[away?.team?.displayName] ?? away?.team?.displayName ?? '',
          data: dataJogo,
        };

        try {
          const oddsResp = await fetch(
            `https://sports.core.api.espn.com/v2/sports/soccer/leagues/bra.1/events/${eventId}/competitions/${compId}/odds`
          );
          const oddsData: any = await oddsResp.json();
          const PROVIDERS = [
            { id: '2000', nome: 'Bet365' },
            { id: '68',   nome: 'ESPN BET' },
            { id: '41',   nome: 'DraftKings' },
            { id: '37',   nome: 'FanDuel' },
            { id: '58',   nome: 'BetMGM' },
            { id: '38',   nome: 'Caesars' },
          ];
          const items: any[] = oddsData.items ?? [];
          let provedor: string | null = null;
          let provider: any = null;
          for (const p of PROVIDERS) {
            const found = items.find((item: any) => String(item.provider?.id) === p.id);
            if (found?.homeTeamOdds?.moneyLine != null || found?.drawOdds?.moneyLine != null || found?.awayTeamOdds?.moneyLine != null) {
              provider = found;
              provedor = p.nome;
              break;
            }
          }
          return {
            ...base,
            provedor,
            mandante:  provider?.homeTeamOdds?.moneyLine ?? null,
            empate:    provider?.drawOdds?.moneyLine ?? null,
            visitante: provider?.awayTeamOdds?.moneyLine ?? null,
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
    res.json(odds);
  } catch (error) {
    console.error('Erro ao buscar odds:', error);
    if (oddsCache) { res.json(oddsCache.dados); return; }
    res.status(500).json({ error: 'Falha ao buscar odds' });
  }
});

const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'https://ondeassistir.space';

app.get('/og', async (req, res) => {
  const slug = String(req.query['time'] ?? '').toLowerCase();

  let title = 'Onde Assistir — Jogos de futebol da semana no Brasil';
  let description = 'Veja onde assistir os jogos de futebol desta semana no Brasil.';
  let imageUrl = `${FRONTEND_URL}/icons/icon-512x512.png`;
  let canonicalUrl = FRONTEND_URL;

  try {
    const snap = await db.collection('jogos').get();
    const jogos: Jogo[] = snap.docs.map(doc => {
      const d = doc.data();
      return {
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
      };
    });

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
  res.setHeader('Cache-Control', 'public, max-age=300');
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

app.get('/sitemap.xml', async (_req, res) => {
  try {
    const snap = await db.collection('jogos').get();
    const times = new Set<string>();
    snap.docs.forEach(doc => {
      const d = doc.data();
      if (d['timeMandante']) times.add(slugifyFull(d['timeMandante']));
      if (d['timeVisitante']) times.add(slugifyFull(d['timeVisitante']));
    });

    const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const urls = [
      `  <url><loc>${FRONTEND_URL}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      ...[...times].sort().map(slug =>
        `  <url><loc>${FRONTEND_URL}/${slug}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`
      ),
    ].join('\n');

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
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
