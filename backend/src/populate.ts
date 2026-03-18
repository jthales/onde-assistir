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
const ai = new GoogleGenAI({ apiKey: process.env['GEMINI_API_KEY'] ?? '' });
const GEMINI_MODEL_ID = 'gemini-3.1-flash-lite-preview';
function espnScoreboardUrl(): string {
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const today = new Date();
  const in7days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  return `https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard?dates=${fmt(today)}-${fmt(in7days)}`;
}

// Normaliza nomes de times da ESPN para os nossos nomes padrão
const TEAM_NAME_MAP: Record<string, string> = {
  'Athletico-PR':    'Athletico Paranaense',
  'Atlético-MG':     'Atlético Mineiro',
  'Atlético Mineiro':'Atlético Mineiro',
  'Vasco da Gama':   'Vasco',
  'Flamengo':        'Flamengo',
  'Palmeiras':       'Palmeiras',
  'Botafogo':        'Botafogo',
  'Corinthians':     'Corinthians',
  'São Paulo':       'São Paulo',
  'Santos':          'Santos',
  'Grêmio':          'Grêmio',
  'Internacional':   'Internacional',
  'Fluminense':      'Fluminense',
  'Cruzeiro':        'Cruzeiro',
  'Bahia':           'Bahia',
  'Fortaleza':       'Fortaleza',
  'Red Bull Bragantino': 'Red Bull Bragantino',
  'RB Bragantino':   'Red Bull Bragantino',
  'Mirassol':        'Mirassol',
  'Sport Recife':    'Sport Recife',
  'Sport':           'Sport Recife',
  'Juventude':       'Juventude',
  'Vitória':         'Vitória',
};

const LEAGUE_NAME_MAP: Record<string, string> = {
  'Brazilian Serie A':        'Brasileirão Série A',
  'Brazil Serie A':           'Brasileirão Série A',
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

async function fetchFixturesFromEspn(): Promise<EspnFixture[]> {
  const res = await fetch(espnScoreboardUrl());
  if (!res.ok) throw new Error(`ESPN API error: ${res.status}`);
  const data: any = await res.json();

  const fixtures: EspnFixture[] = [];

  for (const event of data.events ?? []) {
    const comp = event.competitions?.[0];
    if (!comp) continue;

    const home = comp.competitors?.find((c: any) => c.homeAway === 'home');
    const away = comp.competitors?.find((c: any) => c.homeAway === 'away');
    if (!home || !away) continue;

    const dateObj = new Date(event.date);
    const data_jogo = dateObj.toISOString().slice(0, 10);
    // Converte UTC para horário de Brasília (UTC-3)
    const brt = new Date(dateObj.getTime() - 3 * 60 * 60 * 1000);
    const hora = brt.toISOString().slice(11, 16);

    fixtures.push({
      timeMandante: normalizeTeamName(home.team.displayName),
      timeVisitante: normalizeTeamName(away.team.displayName),
      logoMandante: home.team.logo ?? '',
      logoVisitante: away.team.logo ?? '',
      data: data_jogo,
      hora,
      estadio: comp.venue?.fullName ?? '',
      campeonato: normalizeLeagueName(data.leagues?.[0]?.season?.type?.name ?? data.leagues?.[0]?.name ?? ''),
    });
  }

  return fixtures;
}


async function fetchBroadcastFromGemini(fixtures: EspnFixture[]): Promise<GeminiBroadcast[]> {
  if (fixtures.length === 0) return [];

  const jogosList = fixtures
    .map((f, i) => `${i + 1}. ${f.timeMandante} x ${f.timeVisitante} (${f.data})`)
    .join('\n');

  const prompt = `Você é um especialista em transmissões de futebol brasileiro.

Para cada jogo abaixo, informe os canais de TV e plataformas de streaming que vão transmitir no Brasil:

${jogosList}

Retorne um array JSON, um objeto por jogo, na mesma ordem:
[
  {
    "timeMandante": "<nome igual ao da lista>",
    "timeVisitante": "<nome igual ao da lista>",
    "canal": ["<canal TV aberta/fechada>"],
    "streaming": ["<plataforma de streaming>"]
  }
]
Se não souber, use [] no campo. Retorne apenas o JSON.`;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL_ID,
    contents: prompt,
    config: { responseMimeType: 'application/json' },
  });

  const text = response?.text ?? '';
  console.log('Gemini broadcast response:\n', text.substring(0, 600));

  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    return JSON.parse(match[0]) as GeminiBroadcast[];
  } catch {
    return [];
  }
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

  console.log('Buscando fixtures na ESPN...');
  const fixtures = await fetchFixturesFromEspn();
  console.log(`ESPN retornou ${fixtures.length} jogos:`, fixtures.map(f => `${f.timeMandante} x ${f.timeVisitante}`));

  if (fixtures.length === 0) throw new Error('Nenhum jogo encontrado na ESPN');

  console.log('Buscando transmissões no Gemini...');
  const broadcasts = await fetchBroadcastFromGemini(fixtures);

  // Monta mapa de transmissão por confronto
  const broadcastMap = new Map<string, GeminiBroadcast>();
  for (const b of broadcasts) {
    const key = `${b.timeMandante}|${b.timeVisitante}`;
    broadcastMap.set(key, b);
  }

  const batch = db.batch();
  let total = 0;

  for (const fixture of fixtures) {
    const key = `${fixture.timeMandante}|${fixture.timeVisitante}`;
    const broadcast = broadcastMap.get(key);

    const jogo: Jogo & { id: string; lastUpdated: string } = {
      id: jogoId(fixture.data, fixture.timeMandante, fixture.timeVisitante),
      rodada: 0,
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
      lastUpdated: new Date().toISOString(),
    };

    batch.set(db.collection('jogos').doc(jogo.id), jogo, { merge: true });
    total++;
    console.log(`  ✓ ${jogo.timeMandante} x ${jogo.timeVisitante} | Rodada ${jogo.rodada} | ${jogo.canal.join(', ') || 'sem canal'}`);
  }

  batch.set(db.collection('meta').doc('lastUpdated'), {
    timestamp: new Date().toISOString(),
    totalJogos: total,
  });

  await batch.commit();
  console.log(`\nPopulate concluído: ${total} jogos salvos.`);
}

runPopulate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Erro no populate:', err);
    process.exit(1);
  });
