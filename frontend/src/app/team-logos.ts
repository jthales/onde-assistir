export const TEAM_LOGOS: Record<string, string> = {
  'Athletico Paranaense': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Logo_Athletico_Paranaense.svg/100px-Logo_Athletico_Paranaense.svg.png',
  'Atlético Mineiro':     'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Atletico_mineiro_galo.png/100px-Atletico_mineiro_galo.png',
  'Bahia':                'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Esporte_Clube_Bahia_%28logo%29.svg/100px-Esporte_Clube_Bahia_%28logo%29.svg.png',
  'Botafogo':             'https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/Botafogo_de_Futebol_e_Regatas.svg/100px-Botafogo_de_Futebol_e_Regatas.svg.png',
  'Corinthians':          'https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/SC_Corinthians_Paulista.svg/100px-SC_Corinthians_Paulista.svg.png',
  'Cruzeiro':             'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Cruzeiro_Esporte_Clube.svg/100px-Cruzeiro_Esporte_Clube.svg.png',
  'Flamengo':             'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Flamengo_braz_logo.svg/100px-Flamengo_braz_logo.svg.png',
  'Fluminense':           'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Fluminense_FC_logo.svg/100px-Fluminense_FC_logo.svg.png',
  'Fortaleza':            'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Fortaleza_Esporte_Clube_logo.svg/100px-Fortaleza_Esporte_Clube_logo.svg.png',
  'Grêmio':               'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Gr%C3%AAmio_FBPA.svg/100px-Gr%C3%AAmio_FBPA.svg.png',
  'Internacional':        'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Sport_Club_Internacional.svg/100px-Sport_Club_Internacional.svg.png',
  'Juventude':            'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Esporte_Clube_Juventude_%28logo%29.svg/100px-Esporte_Clube_Juventude_%28logo%29.svg.png',
  'Mirassol':             'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Mirassol_FC.png/100px-Mirassol_FC.png',
  'Palmeiras':            'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Palmeiras_logo.svg/100px-Palmeiras_logo.svg.png',
  'Red Bull Bragantino':  'https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Red_Bull_Bragantino_logo.svg/100px-Red_Bull_Bragantino_logo.svg.png',
  'Santos':               'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Santos_FC_Logo.svg/100px-Santos_FC_Logo.svg.png',
  'São Paulo':            'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Brasao_do_Sao_Paulo_Futebol_Clube.svg/100px-Brasao_do_Sao_Paulo_Futebol_Clube.svg.png',
  'Sport Recife':         'https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Sport_Club_do_Recife.svg/100px-Sport_Club_do_Recife.svg.png',
  'Vasco':                'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Vasco_da_Gama_scudo.svg/100px-Vasco_da_Gama_scudo.svg.png',
  'Vitória':              'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/EC_Vit%C3%B3ria.svg/100px-EC_Vit%C3%B3ria.svg.png',
};

export function getTeamLogo(nome: string): string | null {
  return TEAM_LOGOS[nome] ?? null;
}

export function teamInitials(nome: string): string {
  return nome
    .split(' ')
    .filter(w => !['de', 'do', 'da', 'e'].includes(w.toLowerCase()))
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}
