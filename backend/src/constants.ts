export const ESPN_LEAGUES = {
  brasileirao:  'bra.1',
  libertadores: 'conmebol.libertadores',
  sudamericana: 'conmebol.sudamericana',
  championsleague: 'uefa.champions',
  copadobrasil: 'bra.copa_do_brazil',
} as const;

export function espnScoreboardUrl(): string {
  return espnScoreboardUrlForLeague(ESPN_LEAGUES.brasileirao, 7);
}

/** URL fixa cobrindo todos os 104 jogos da Copa 2026 (fase de grupos até final). */
export function espnCopaUrl(): string {
  return 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=300';
}

export function espnScoreboardUrlForLeague(leagueId: string, janelaDias = 14): string {
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  // Usar data BRT (UTC-3) para não perder jogos do dia após as 21h (quando UTC vira dia seguinte)
  const brtNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const fim = new Date(brtNow.getTime() + janelaDias * 24 * 60 * 60 * 1000);
  return `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueId}/scoreboard?dates=${fmt(brtNow)}-${fmt(fim)}`;
}

// Mapa de slug do time → ESPN team ID (para buscar notícias)
// Slugs derivados dos nomes normalizados em TEAM_NAME_MAP via slugifyFull()
export const TEAM_ESPN_ID_MAP: Record<string, number> = {
  'flamengo':              819,
  'palmeiras':             2029,
  'sao-paulo':             2026,
  'fluminense':            3445,
  'bahia':                 9967,
  'athletico-paranaense':  3458,
  'gremio':                6273,
  'vasco':                 3454,
  'vitoria':               3457,
  'corinthians':           874,
  'internacional':         1936,
  'atletico-mineiro':      7632,
  'red-bull-bragantino':   6079,
  'mirassol':              9169,
  'santos':                2674,
  'botafogo':              6086,
  'cruzeiro':              2022,
  'fortaleza':             6272,
  'sport-recife':          7635,
  'juventude':             6270,
};

export const LIGA_SLUG_TO_ESPN: Record<string, string> = {
  'brasileirao':    ESPN_LEAGUES.brasileirao,
  'libertadores':   ESPN_LEAGUES.libertadores,
  'sul-americana':  ESPN_LEAGUES.sudamericana,
  'champions-league': ESPN_LEAGUES.championsleague,
  'copa-do-brasil': ESPN_LEAGUES.copadobrasil,
  'copa-2026':      'fifa.world',
};

export const LIGA_SLUG_LABEL: Record<string, string> = {
  'brasileirao':    'Brasileirão Série A',
  'libertadores':   'Copa Libertadores',
  'sul-americana':  'Copa Sul-Americana',
  'champions-league': 'UEFA Champions League',
  'copa-do-brasil': 'Copa do Brasil',
  'copa-2026':      'Copa do Mundo 2026',
};

export const TEAM_NAME_MAP: Record<string, string> = {
  'Athletico-PR':        'Athletico Paranaense',
  'Atlético-MG':         'Atlético Mineiro',
  'Atlético Mineiro':    'Atlético Mineiro',
  'Vasco da Gama':       'Vasco',
  'Flamengo':            'Flamengo',
  'Palmeiras':           'Palmeiras',
  'Botafogo':            'Botafogo',
  'Corinthians':         'Corinthians',
  'São Paulo':           'São Paulo',
  'Santos':              'Santos',
  'Grêmio':              'Grêmio',
  'Internacional':       'Internacional',
  'Fluminense':          'Fluminense',
  'Cruzeiro':            'Cruzeiro',
  'Bahia':               'Bahia',
  'Fortaleza':           'Fortaleza',
  'Red Bull Bragantino': 'Red Bull Bragantino',
  'RB Bragantino':       'Red Bull Bragantino',
  'Mirassol':            'Mirassol',
  'Sport Recife':        'Sport Recife',
  'Sport':               'Sport Recife',
  'Juventude':           'Juventude',
  'Vitória':             'Vitória',
  // Copa do Mundo 2026 — ESPN English → Português (igual ao Firestore)
  'Mexico':              'México',
  'South Africa':        'África do Sul',
  'South Korea':         'Coreia do Sul',
  'Czechia':             'Rep. Tcheca',
  'Canada':              'Canadá',
  'Bosnia-Herzegovina':  'Bósnia',
  'Qatar':               'Catar',
  'Switzerland':         'Suíça',
  'Brazil':              'Brasil',
  'Morocco':             'Marrocos',
  'Haiti':               'Haiti',
  'Scotland':            'Escócia',
  'United States':       'Estados Unidos',
  'Paraguay':            'Paraguai',
  'Australia':           'Austrália',
  'Türkiye':             'Turquia',
  'Germany':             'Alemanha',
  'Curacao':             'Curaçao',
  'Ivory Coast':         'Costa do Marfim',
  'Ecuador':             'Equador',
  'Netherlands':         'Holanda',
  'Japan':               'Japão',
  'Sweden':              'Suécia',
  'Tunisia':             'Tunísia',
  'Belgium':             'Bélgica',
  'Egypt':               'Egito',
  'Iran':                'Irã',
  'New Zealand':         'Nova Zelândia',
  'Spain':               'Espanha',
  'Cape Verde':          'Cabo Verde',
  'Saudi Arabia':        'Arábia Saudita',
  'Uruguay':             'Uruguai',
  'France':              'França',
  'Senegal':             'Senegal',
  'Iraq':                'Iraque',
  'Norway':              'Noruega',
  'Argentina':           'Argentina',
  'Algeria':             'Argélia',
  'Austria':             'Áustria',
  'Jordan':              'Jordânia',
  'Portugal':            'Portugal',
  'Congo DR':            'RD Congo',
  'Uzbekistan':          'Uzbequistão',
  'Colombia':            'Colômbia',
  'England':             'Inglaterra',
  'Croatia':             'Croácia',
  'Ghana':               'Gana',
  'Panama':              'Panamá',
};

// A ESPN passou a responder 400 para `dates=YYYYMMDD-YYYYMMDD` (intervalo). Datas únicas e o
// ano inteiro (`dates=YYYY`) continuam funcionando, então intervalos são resolvidos buscando
// o(s) ano(s) envolvidos e filtrando os eventos pelo período pedido.
const ESPN_YEAR_CACHE_TTL_MS = 60_000;
const espnYearCache = new Map<string, { at: number; promise: Promise<any> }>();

function fetchEspnYear(base: string, year: string): Promise<any> {
  const key = `${base}|${year}`;
  const hit = espnYearCache.get(key);
  if (hit && Date.now() - hit.at < ESPN_YEAR_CACHE_TTL_MS) return hit.promise;
  const promise = fetch(`${base}?dates=${year}&limit=1000`).then(async (r) => {
    if (!r.ok) throw new Error(`ESPN API error: ${r.status}`);
    return r.json();
  });
  espnYearCache.set(key, { at: Date.now(), promise });
  promise.catch(() => espnYearCache.delete(key));
  return promise;
}

/** Substituto de `fetch` para URLs do scoreboard da ESPN; expande `dates=A-B` em consultas por ano. */
export async function fetchEspn(url: string): Promise<Response> {
  const m = url.match(/^([^?]+)\?(?:.*&)?dates=(\d{8})-(\d{8})/);
  if (!m) return fetch(url);
  const [, base, ini, fim] = m;
  const toMs = (s: string, end: boolean) =>
    Date.parse(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${end ? '23:59:59' : '00:00:00'}Z`);
  const from = toMs(ini, false);
  const to = toMs(fim, true);

  const years: string[] = [];
  for (let y = +ini.slice(0, 4); y <= +fim.slice(0, 4); y++) years.push(String(y));

  try {
    const parts = await Promise.all(years.map((y) => fetchEspnYear(base, y)));
    const events = parts
      .flatMap((p) => p.events ?? [])
      .filter((e: any) => { const t = Date.parse(e.date); return t >= from && t <= to; });
    const body = { ...parts[0], events };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 502 });
  }
}
