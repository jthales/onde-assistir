import { logoUrl } from './logo-url';

describe('logoUrl', () => {
  it('redimensiona o logo ESPN conhecido com o tamanho solicitado', () => {
    expect(logoUrl('https://a.espncdn.com/i/teamlogos/soccer/500/819.png', 64))
      .toBe('https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/819.png&w=64&h=64');
    expect(logoUrl('https://a.espncdn.com/i/teamlogos/soccer/500/819.png')).toContain('&w=144&h=144');
  });

  it('preserva URLs desconhecidas, inclusive parâmetros e outros caminhos ESPN', () => {
    for (const url of ['https://example.com/logo.png',
      'https://a.espncdn.com/i/teamlogos/soccer/500/819.png?v=1',
      'https://a.espncdn.com/i/teamlogos/soccer/100/819.png']) {
      expect(logoUrl(url)).toBe(url);
    }
  });

  it('preserva valores vazios ou ausentes', () => {
    expect(logoUrl('')).toBe('');
    expect(logoUrl(undefined)).toBeUndefined();
    expect(logoUrl(null)).toBeNull();
  });
});
