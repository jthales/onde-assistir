import { logoUrl, onLogoError } from './logo-url';

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

describe('onLogoError', () => {
  const original = 'https://a.espncdn.com/i/teamlogos/soccer/500/819.png';

  function imagem(url = original, ocultacao: 'display' | 'visibility' = 'display'): HTMLImageElement {
    const img = document.createElement('img');
    img.src = logoUrl(url);
    img.addEventListener('error', event => onLogoError(event, url, ocultacao));
    return img;
  }

  it('tenta a URL original na primeira falha e só oculta na segunda, sem loop', () => {
    const img = imagem();
    img.dispatchEvent(new Event('error'));
    expect(img.getAttribute('src')).toBe(original);
    expect(img.style.display).toBe('');
    img.dispatchEvent(new Event('error'));
    expect(img.style.display).toBe('none');
    img.dispatchEvent(new Event('error'));
    expect(img.getAttribute('src')).toBe(original);
    expect(img.style.display).toBe('none');
  });

  it('mantém visibility hidden no fallback da sidebar, sem remover sua caixa', () => {
    const img = imagem(original, 'visibility');
    img.dispatchEvent(new Event('error'));
    expect(img.style.visibility).toBe('');
    img.dispatchEvent(new Event('error'));
    expect(img.style.visibility).toBe('hidden');
    expect(img.style.display).toBe('');
  });

  it('não tenta novamente uma URL desconhecida ou já original', () => {
    const desconhecida = imagem('https://example.test/logo.png');
    desconhecida.dispatchEvent(new Event('error'));
    expect(desconhecida.getAttribute('src')).toBe('https://example.test/logo.png');
    expect(desconhecida.style.display).toBe('none');
    const img = imagem();
    img.src = original;
    img.dispatchEvent(new Event('error'));
    expect(img.style.display).toBe('none');
  });

  it('não repete a tentativa mesmo se o src otimizado for reaplicado no mesmo elemento', () => {
    const img = imagem();
    img.dispatchEvent(new Event('error'));
    img.src = logoUrl(original);
    img.dispatchEvent(new Event('error'));
    expect(img.style.display).toBe('none');
    expect(img.getAttribute('src')).toBe(logoUrl(original));
  });
});
