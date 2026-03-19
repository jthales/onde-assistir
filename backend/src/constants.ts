export function espnScoreboardUrl(): string {
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  // Usar data BRT (UTC-3) para não perder jogos do dia após as 21h (quando UTC vira dia seguinte)
  const brtNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const in7days = new Date(brtNow.getTime() + 7 * 24 * 60 * 60 * 1000);
  return `https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard?dates=${fmt(brtNow)}-${fmt(in7days)}`;
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
