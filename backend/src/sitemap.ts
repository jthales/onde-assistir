import { buildJogoUrl, JogoSlug } from './jogo-slug';
import { LIGA_SLUG_TO_ESPN, TEAM_ESPN_ID_MAP } from './constants';

export function dataBrt(agora: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora);
}

function escapeXml(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export interface JogoSitemap extends JogoSlug {
  /** Data/hora da última gravação do jogo no populate (ISO). Vira o lastmod da partida. */
  lastUpdated?: string;
}

export interface OpcoesSitemap {
  /**
   * Slugs de time que a SPA realmente resolve para uma página (app.ts: `classificacao().find(slugify(nome) === slug)`),
   * ou seja, os times da tabela do Brasileirão. Padrão: chaves de TEAM_ESPN_ID_MAP (fallback estático).
   */
  timesComPagina?: readonly string[];
}

/**
 * Páginas de campeonato = chaves de LIGA_SLUG_TO_ESPN (fonte única do backend), exceto a Copa 2026,
 * que tem rota própria. O teste de paridade garante que o frontend (CAMP_SLUG_LABEL) mantém a mesma lista.
 */
export const CAMPEONATOS_SITEMAP: readonly string[] = Object.keys(LIGA_SLUG_TO_ESPN).filter(slug => slug !== 'copa-2026');

/** lastmod real da partida: data (YYYY-MM-DD) do lastUpdated; sem o campo, sem lastmod. */
function lastmodDe(jogo: JogoSitemap): string | undefined {
  const dia = typeof jogo.lastUpdated === 'string' ? jogo.lastUpdated.slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : undefined;
}

interface Entrada { url: string; priority: string; lastmod?: string }

/** Função pura: o chamador fornece os dados, a origem e o instante de geração. */
export function buildSitemapXml(
  jogos: readonly JogoSitemap[], frontendUrl: string, agora: Date, opcoes: OpcoesSitemap = {},
): string {
  const origem = frontendUrl.replace(/\/+$/, '');
  const hoje = dataBrt(agora);
  const times = [...new Set((opcoes.timesComPagina ?? Object.keys(TEAM_ESPN_ID_MAP)).filter(Boolean))].sort();
  const futuros = jogos.filter(jogo => jogo.timeMandante && jogo.timeVisitante
    && /^\d{4}-\d{2}-\d{2}$/.test(jogo.data) && jogo.data >= hoje);
  const partidas = new Map<string, string | undefined>();
  for (const jogo of futuros) {
    const url = origem + buildJogoUrl(jogo, futuros);
    const lastmod = lastmodDe(jogo);
    const atual = partidas.get(url);
    partidas.set(url, atual && lastmod ? (atual > lastmod ? atual : lastmod) : (atual ?? lastmod));
  }
  const entradas: Entrada[] = [
    { url: `${origem}/`, priority: '1.0' },
    ...CAMPEONATOS_SITEMAP.map(slug => ({ url: `${origem}/campeonato/${slug}`, priority: '0.9' })),
    { url: `${origem}/copa-2026`, priority: '0.9' },
    { url: `${origem}/ao-vivo`, priority: '0.8' },
    ...times.map(slug => ({ url: `${origem}/${slug}`, priority: '0.8' })),
    ...[...partidas.keys()].sort().map(url => ({ url, priority: '0.7', lastmod: partidas.get(url) })),
  ];
  const vistas = new Set<string>();
  const urls = entradas.filter(({ url }) => {
    if (vistas.has(url)) return false;
    vistas.add(url);
    return true;
  }).map(({ url, priority, lastmod }) =>
    `  <url><loc>${escapeXml(url)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>daily</changefreq><priority>${priority}</priority></url>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}
