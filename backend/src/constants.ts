export const ESPN_LEAGUES = {
  brasileirao:  'bra.1',
  libertadores: 'conmebol.libertadores',
  sudamericana: 'conmebol.sudamericana',
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
  'copa-do-brasil': ESPN_LEAGUES.copadobrasil,
  'copa-2026':      'fifa.world',
};

export const LIGA_SLUG_LABEL: Record<string, string> = {
  'brasileirao':    'Brasileirão Série A',
  'libertadores':   'Copa Libertadores',
  'sul-americana':  'Copa Sul-Americana',
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
};
