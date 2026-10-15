/** Reduz apenas os logos ESPN conhecidos; outros provedores mantêm a URL original. */
export function logoUrl<T extends string | null | undefined>(url: T, width = 144): T | string {
  if (!url) return url;
  const match = /^https:\/\/a\.espncdn\.com\/i\/teamlogos\/soccer\/500\/(\d+)\.png$/.exec(url);
  return match
    ? `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/${match[1]}.png&w=${width}&h=${width}`
    : url;
}
