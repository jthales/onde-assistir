import { buildJogoUrl, JogoSlug, slugify } from './jogo-slug';

export function dataBrt(agora: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora);
}

function escapeXml(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Função pura: o chamador fornece os dados, a origem e o instante de geração. */
export function buildSitemapXml(jogos: readonly JogoSlug[], frontendUrl: string, agora: Date): string {
  const origem = frontendUrl.replace(/\/+$/, '');
  const hoje = dataBrt(agora);
  const times = new Set<string>();
  for (const jogo of jogos) {
    if (typeof jogo.timeMandante !== 'string' || !jogo.timeMandante.trim()
      || typeof jogo.timeVisitante !== 'string' || !jogo.timeVisitante.trim()) continue;
    for (const nome of [jogo.timeMandante, jogo.timeVisitante]) {
      const slug = slugify(nome);
      if (slug) times.add(slug);
    }
  }
  const futuros = jogos.filter(jogo => jogo.timeMandante && jogo.timeVisitante
    && /^\d{4}-\d{2}-\d{2}$/.test(jogo.data) && jogo.data >= hoje);
  const urlsPartidas = [...new Set(futuros.map(jogo => origem + buildJogoUrl(jogo, futuros)))].sort();
  const entradas = [
    { url: `${origem}/`, priority: '1.0' },
    ...['brasileirao', 'libertadores', 'sul-americana'].map(slug => ({
      url: `${origem}/campeonato/${slug}`, priority: '0.9',
    })),
    ...[...times].sort().map(slug => ({ url: `${origem}/${slug}`, priority: '0.8' })),
    ...urlsPartidas.map(url => ({ url, priority: '0.7' })),
  ];
  const vistas = new Set<string>();
  const urls = entradas.filter(({ url }) => {
    if (vistas.has(url)) return false;
    vistas.add(url);
    return true;
  }).map(({ url, priority }) =>
    `  <url><loc>${escapeXml(url)}</loc><lastmod>${hoje}</lastmod><changefreq>daily</changefreq><priority>${priority}</priority></url>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}
