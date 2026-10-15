/** Reduz apenas os logos ESPN conhecidos; outros provedores mantêm a URL original. */
export function logoUrl<T extends string | null | undefined>(url: T, width = 144): T | string {
  if (!url) return url;
  const match = /^https:\/\/a\.espncdn\.com\/i\/teamlogos\/soccer\/500\/(\d+)\.png$/.exec(url);
  return match
    ? `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/${match[1]}.png&w=${width}&h=${width}`
    : url;
}

const originaisTentadas = new WeakMap<HTMLImageElement, string>();

/** Tenta o PNG original uma vez; a segunda falha preserva a ocultação anterior. */
export function onLogoError(event: Event, original: string | null | undefined,
  ocultacao: 'display' | 'visibility' = 'display'): void {
  const img = event.target as HTMLImageElement | null;
  if (!img) return;
  if (original && logoUrl(original) !== original && img.getAttribute('src') !== original
    && originaisTentadas.get(img) !== original) {
    originaisTentadas.set(img, original);
    img.src = original;
    return;
  }
  if (ocultacao === 'visibility') img.style.visibility = 'hidden';
  else img.style.display = 'none';
}
