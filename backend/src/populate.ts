/**
 * Populate: ESPN API (fixtures reais) + Gemini (rodada + transmissão).
 * Limpa a coleção antes de gravar.
 *
 * Uso: npm run populate
 */
import 'dotenv/config';
import * as admin from 'firebase-admin';
import { GoogleGenAI } from '@google/genai';
import { Jogo } from './types';
import { db } from './firebase';
import { espnScoreboardUrlForLeague, ESPN_LEAGUES, TEAM_NAME_MAP } from './constants';
import { buscarDadosRodada, buscarOndeAssistir } from './scraper';
const ai = new GoogleGenAI({ apiKey: process.env['GEMINI_API_KEY'] ?? '' });
const GEMINI_MODEL_ID = 'gemini-3.1-flash-lite-preview';

const ESPN_LEAGUE_LABELS: Record<string, string> = {
  'bra.1':                  'Brasileirão',
  'conmebol.libertadores':  'Libertadores',
  'conmebol.sudamericana':  'Sul-Americana',
};

const LEAGUE_NAME_MAP: Record<string, string> = {
  'Brasileiro Serie A':       'Brasileirão',
  'Brazilian Serie A':        'Brasileirão',
  'Brazil Serie A':           'Brasileirão',
  'Brasileiro Serie B':       'Brasileirão Série B',
  'Brazilian Serie B':        'Brasileirão Série B',
  'Brazil Serie B':           'Brasileirão Série B',
  'CONMEBOL Libertadores':    'Libertadores',
  'CONMEBOL Sudamericana':    'Sul-Americana',
};

function normalizeLeagueName(raw: string): string {
  if (!raw) return 'Brasileirão Série A';
  const trimmed = raw.trim();
  // Tenta match exato primeiro
  if (LEAGUE_NAME_MAP[trimmed]) return LEAGUE_NAME_MAP[trimmed];
  // Tenta match parcial (ex: "2026 Brasileiro Serie A" contém "Serie A")
  for (const [key, value] of Object.entries(LEAGUE_NAME_MAP)) {
    if (trimmed.toLowerCase().includes(key.toLowerCase())) return value;
  }
  return trimmed;
}

function normalizeTeamName(name: string): string {
  return TEAM_NAME_MAP[name] ?? name;
}

interface EspnFixture {
  timeMandante: string;
  timeVisitante: string;
  logoMandante: string;
  logoVisitante: string;
  data: string;
  hora: string;
  estadio: string;
  campeonato: string;
}

interface GeminiBroadcast {
  timeMandante: string;
  timeVisitante: string;
  canal: string[];
  streaming: string[];
}

const TIMES_BRASILEIROS = new Set(Object.values(TEAM_NAME_MAP));

async function fetchScoreboardForLeague(leagueId: string, janelaDias?: number): Promise<EspnFixture[]> {
  const res = await fetch(espnScoreboardUrlForLeague(leagueId, janelaDias));
  if (!res.ok) throw new Error(`ESPN API error (${leagueId}): ${res.status}`);
  const data: any = await res.json();

  const fixtures: EspnFixture[] = [];

  for (const event of data.events ?? []) {
    const comp = event.competitions?.[0];
    if (!comp) continue;

    const home = comp.competitors?.find((c: any) => c.homeAway === 'home');
    const away = comp.competitors?.find((c: any) => c.homeAway === 'away');
    if (!home || !away) continue;

    const dateObj = new Date(event.date);
    // Converte UTC para horário de Brasília (UTC-3)
    const brt = new Date(dateObj.getTime() - 3 * 60 * 60 * 1000);
    const data_jogo = brt.toISOString().slice(0, 10);
    const hora = brt.toISOString().slice(11, 16);

    fixtures.push({
      timeMandante: normalizeTeamName(home.team.displayName),
      timeVisitante: normalizeTeamName(away.team.displayName),
      logoMandante: home.team.logo ?? '',
      logoVisitante: away.team.logo ?? '',
      data: data_jogo,
      hora,
      estadio: comp.venue?.fullName ?? '',
      campeonato: normalizeLeagueName(data.leagues?.[0]?.name ?? data.leagues?.[0]?.season?.type?.name ?? ''),
    });
  }

  return fixtures;
}

async function fetchFixturesFromEspn(): Promise<EspnFixture[]> {
  const ligas: { id: string; filtrarBR: boolean; janelaDias: number }[] = [
    { id: ESPN_LEAGUES.brasileirao,  filtrarBR: false, janelaDias: 5 },
    { id: ESPN_LEAGUES.libertadores, filtrarBR: true,  janelaDias: 5 },
    { id: ESPN_LEAGUES.sudamericana, filtrarBR: true,  janelaDias: 5 },
  ];

  const todas: EspnFixture[] = [];
  for (const liga of ligas) {
    const fixtures = await fetchScoreboardForLeague(liga.id, liga.janelaDias);
    const filtradas = liga.filtrarBR
      ? fixtures.filter(f => TIMES_BRASILEIROS.has(f.timeMandante) || TIMES_BRASILEIROS.has(f.timeVisitante))
      : fixtures;
    const label = ESPN_LEAGUE_LABELS[liga.id] ?? liga.id;
    const filtroInfo = liga.filtrarBR ? ` (${fixtures.length} total → ${filtradas.length} com times BR)` : '';
    console.log(`  ${label}: ${filtradas.length} jogos${filtroInfo}`);
    todas.push(...filtradas);
  }
  return todas;
}


async function fetchBroadcastFromGemini(fixtures: EspnFixture[]): Promise<GeminiBroadcast[]> {
  if (fixtures.length === 0) return [];

  const jogosList = fixtures
    .map((f, i) => `${i + 1}. ${f.timeMandante} x ${f.timeVisitante} — ${f.campeonato} (${f.data}${f.hora ? ' ' + f.hora : ''})`)
    .join('\n');

  const prompt = `Você é um especialista em transmissões de futebol brasileiro.

Para cada jogo abaixo, informe os canais de TV e plataformas de streaming que vão transmitir no Brasil.

Direitos de transmissão atuais:
- TV aberta: "Globo" transmite jogos selecionados do Brasileirão Série A e Copa do Brasil.
- TV fechada: "SporTV", "SporTV 2", "SporTV 3" transmitem Brasileirão, Copa do Brasil, Libertadores e Sul-Americana.
- Pay-per-view: "Premiere" transmite Brasileirão Série A (exceto jogos da Globo).
- Streaming:
  - "Globoplay": transmite todos os jogos do Brasileirão, Copa do Brasil e seleção brasileira.
  - "Cazé TV": transmite ao vivo no YouTube jogos do Brasileirão Série A (jogos de grande audiência), Copa do Brasil, Libertadores e Sul-Americana. Jogos como Corinthians, Flamengo, Palmeiras, São Paulo costumam estar na Cazé TV.
  - "Ge TV": canal do YouTube do Ge/Globo Esporte que transmite alguns jogos ao vivo gratuitamente.
  - "Amazon Prime Video": transmite alguns jogos do Brasileirão Série A.
- Se não tiver certeza sobre um canal ou plataforma específica, use [].

Jogos:
${jogosList}

Retorne um array JSON, um objeto por jogo, na mesma ordem:
[
  {
    "timeMandante": "<nome igual ao da lista>",
    "timeVisitante": "<nome igual ao da lista>",
    "canal": ["<TV aberta ou fechada>"],
    "streaming": ["<plataforma digital>"]
  }
]
Retorne apenas o JSON.`;

  const MAX_RETRIES = 50;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL_ID,
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });

      const text = response?.text ?? '';

      const match = text.match(/\[[\s\S]*\]/);
      if (!match) { console.warn('Gemini: resposta sem array JSON'); return []; }
      const parsed = JSON.parse(match[0]) as GeminiBroadcast[];
      console.log(`Gemini: ${parsed.filter(b => b.canal.length + b.streaming.length > 0).length}/${parsed.length} jogos com transmissão`);
      return parsed;
    } catch (err: any) {
      lastError = err;
      const is503 = err?.status === 503 || String(err?.message ?? '').includes('503');
      if (!is503 || attempt === MAX_RETRIES) throw err;
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 4 * 60 * 1000); // 2s, 4s, 8s... máx 4min
      console.warn(`Gemini 503, tentativa ${attempt}/${MAX_RETRIES}. Aguardando ${delay / 1000}s...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

function jogoId(date: string, mandante: string, visitante: string): string {
  const slug = (s: string) => s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return `${date}-${slug(mandante)}-${slug(visitante)}`;
}

async function clearCollection(ref: admin.firestore.CollectionReference): Promise<void> {
  const snap = await ref.limit(100).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  await clearCollection(ref);
}

async function runPopulate(): Promise<void> {
  console.log('Limpando coleção jogos...');
  await clearCollection(db.collection('jogos'));

  console.log('\n── ESPN ──');
  const fixtures = await fetchFixturesFromEspn();
  const porCampeonato = fixtures.reduce<Record<string, number>>((acc, f) => {
    acc[f.campeonato] = (acc[f.campeonato] ?? 0) + 1;
    return acc;
  }, {});
  const resumoCamp = Object.entries(porCampeonato).map(([c, n]) => `${n} ${c}`).join(' | ');
  console.log(`Total: ${fixtures.length} jogos — ${resumoCamp}`);

  if (fixtures.length === 0) throw new Error('Nenhum jogo encontrado na ESPN');

  // Passo 1: buscar artigo de rodada uma vez (1 request) para extrair rodada + transmissões em lote
  console.log('\nBuscando artigo de rodada no ge.globo...');
  const dadosRodada = await buscarDadosRodada(fixtures);
  const rodadaNum = dadosRodada?.rodada ?? 0;

  // Passo 2: para cada jogo, tenta rodada primeiro; fallback busca individual; fallback Gemini
  const broadcastMap = new Map<string, GeminiBroadcast>();
  const sourceMap = new Map<string, 'rodada' | 'scrape' | 'gemini' | 'nenhum'>();
  const failedFixtures: EspnFixture[] = [];

  console.log('\n── Transmissões ──');
  for (const fixture of fixtures) {
    const key = `${fixture.timeMandante}|${fixture.timeVisitante}`;

    // Tenta artigo de rodada (sem request adicional)
    const fromRodada = dadosRodada?.buscarTransmissao(fixture.timeMandante, fixture.timeVisitante);
    if (fromRodada && (fromRodada.canal.length > 0 || fromRodada.streaming.length > 0)) {
      broadcastMap.set(key, { timeMandante: fixture.timeMandante, timeVisitante: fixture.timeVisitante, ...fromRodada });
      sourceMap.set(key, 'rodada');
      console.log(`✅ [rodada]  ${fixture.timeMandante} x ${fixture.timeVisitante} → ${[...fromRodada.canal, ...fromRodada.streaming].join(', ')}`);
      continue;
    }

    // Fallback: matéria individual
    const { canal, streaming } = await buscarOndeAssistir(fixture.timeMandante, fixture.timeVisitante);
    if (canal.length > 0 || streaming.length > 0) {
      broadcastMap.set(key, { timeMandante: fixture.timeMandante, timeVisitante: fixture.timeVisitante, canal, streaming });
      sourceMap.set(key, 'scrape');
    } else {
      failedFixtures.push(fixture);
    }
  }

  // Passo 3: fallback Gemini para jogos onde o scrape falhou
  if (failedFixtures.length > 0) {
    console.log(`\n── Gemini (fallback para ${failedFixtures.length} jogo(s)) ──`);
    const geminiResults = await fetchBroadcastFromGemini(failedFixtures);
    for (const b of geminiResults) {
      const key = `${b.timeMandante}|${b.timeVisitante}`;
      if (!broadcastMap.has(key)) {
        broadcastMap.set(key, b);
        sourceMap.set(key, b.canal.length + b.streaming.length > 0 ? 'gemini' : 'nenhum');
        const channels = [...b.canal, ...b.streaming].join(', ');
        if (channels) {
          console.log(`✅ [gemini]  ${b.timeMandante} x ${b.timeVisitante} → ${channels}`);
        } else {
          console.log(`⚠️  [gemini]  ${b.timeMandante} x ${b.timeVisitante} → sem transmissão`);
        }
      }
    }
  }

  const batch = db.batch();
  let total = 0;

  for (const fixture of fixtures) {
    const key = `${fixture.timeMandante}|${fixture.timeVisitante}`;
    const broadcast = broadcastMap.get(key);

    const jogo: Jogo & { id: string; lastUpdated: string } = {
      id: jogoId(fixture.data, fixture.timeMandante, fixture.timeVisitante),
      rodada: rodadaNum,
      timeMandante: fixture.timeMandante,
      timeVisitante: fixture.timeVisitante,
      logoMandante: fixture.logoMandante,
      logoVisitante: fixture.logoVisitante,
      data: fixture.data,
      hora: fixture.hora,
      canal: broadcast?.canal ?? [],
      streaming: broadcast?.streaming ?? [],
      estadio: fixture.estadio,
      campeonato: fixture.campeonato,
      lastUpdated: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    };

    batch.set(db.collection('jogos').doc(jogo.id), jogo, { merge: true });
    total++;
  }

  batch.set(db.collection('meta').doc('lastUpdated'), {
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    totalJogos: total,
  });

  await batch.commit();

  // Resumo final
  const bySource = { rodada: 0, scrape: 0, gemini: 0, nenhum: 0 };
  for (const fixture of fixtures) {
    const key = `${fixture.timeMandante}|${fixture.timeVisitante}`;
    const src = sourceMap.get(key) ?? 'nenhum';
    bySource[src]++;
  }
  console.log('\n── Resultado ──');
  console.log(`  ${total} jogos salvos`);
  console.log(`  Fontes: ${bySource.rodada} rodada · ${bySource.scrape} scrape · ${bySource.gemini} Gemini · ${bySource.nenhum} sem transmissão`);
}

runPopulate()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error('Erro no populate:', err);
    process.exitCode = 1;
  });
