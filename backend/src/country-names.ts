export const COUNTRY_NAMES_PT: Record<string, string> = {
  // Grupo A
  'Mexico': 'México',
  'South Africa': 'África do Sul',
  'South Korea': 'Coreia do Sul',
  'Czechia': 'Rep. Tcheca',
  // Grupo B
  'Canada': 'Canadá',
  'Bosnia-Herzegovina': 'Bósnia',
  'Qatar': 'Catar',
  'Switzerland': 'Suíça',
  // Grupo C
  'Brazil': 'Brasil',
  'Morocco': 'Marrocos',
  'Haiti': 'Haiti',
  'Scotland': 'Escócia',
  // Grupo D
  'United States': 'Estados Unidos',
  'Paraguay': 'Paraguai',
  'Australia': 'Austrália',
  'Türkiye': 'Turquia',
  // Grupo E
  'Germany': 'Alemanha',
  'Curacao': 'Curaçao',
  'Ivory Coast': 'Costa do Marfim',
  'Ecuador': 'Equador',
  // Grupo F
  'Netherlands': 'Holanda',
  'Japan': 'Japão',
  'Sweden': 'Suécia',
  'Tunisia': 'Tunísia',
  // Grupo G
  'Belgium': 'Bélgica',
  'Egypt': 'Egito',
  'Iran': 'Irã',
  'New Zealand': 'Nova Zelândia',
  // Grupo H
  'Spain': 'Espanha',
  'Cape Verde': 'Cabo Verde',
  'Saudi Arabia': 'Arábia Saudita',
  'Uruguay': 'Uruguai',
  // Grupo I
  'France': 'França',
  'Senegal': 'Senegal',
  'Iraq': 'Iraque',
  'Norway': 'Noruega',
  // Grupo J
  'Argentina': 'Argentina',
  'Algeria': 'Argélia',
  'Austria': 'Áustria',
  'Jordan': 'Jordânia',
  // Grupo K
  'Portugal': 'Portugal',
  'Congo DR': 'RD Congo',
  'Uzbekistan': 'Uzbequistão',
  'Colombia': 'Colômbia',
  // Grupo L
  'England': 'Inglaterra',
  'Croatia': 'Croácia',
  'Ghana': 'Gana',
  'Panama': 'Panamá',
};

export function translateCountry(name: string): string {
  return COUNTRY_NAMES_PT[name] ?? name;
}
