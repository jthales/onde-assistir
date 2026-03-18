export function espnScoreboardUrl(): string {
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const today = new Date();
  const in7days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  return `https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard?dates=${fmt(today)}-${fmt(in7days)}`;
}

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
