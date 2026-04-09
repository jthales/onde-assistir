/**
 * Scraper ge.globo — busca transmissões via API interna busca.globo.com + fetch+cheerio.
 *
 * Estratégia em duas etapas (em populate.ts):
 * 1. buscarDadosRodada(fixtures) — faz UMA busca e UMA leitura do artigo de rodada
 *    para extrair o número da rodada e as transmissões de todos os jogos de uma vez.
 * 2. buscarOndeAssistir(mandante, visitante) — fallback: busca matéria individual
 *    para jogos não encontrados no artigo de rodada.
 */
import * as cheerio from 'cheerio';

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Referer': 'https://ge.globo.com/',
};

// Parâmetros capturados das requisições reais do ge.globo.com
const SEARCH_SPECIES = [
  'Matéria', ' Matéria ', 'Notícias', 'Materia', 'MatÃ©ria',
  'Review', 'Colunas', 'Desfiles', 'Ensaios', 'Dicas',
];

// Ordem importa: padrões mais específicos antes dos genéricos
const CANAIS_TV: Array<{ match: string; display: string }> = [
  { match: 'tv globo',   display: 'TV Globo'    },
  { match: 'sportv 2',   display: 'SporTV 2'    },
  { match: 'sportv 3',   display: 'SporTV 3'    },
  { match: 'sportv',     display: 'SporTV'      },
  { match: 'globo',      display: 'Globo'        },
  { match: 'espn brasil', display: 'ESPN Brasil' },
  { match: 'espn',       display: 'ESPN'         },
  { match: 'record',     display: 'Record'       },
  { match: 'band',       display: 'Band'         },
  { match: 'tnt',        display: 'TNT'          },
  { match: 'fox sports', display: 'Fox Sports'   },
];

const CANAIS_STREAMING: Array<{ match: string; display: string }> = [
  { match: 'amazon prime', display: 'Amazon Prime Video' }, // captura "Amazon Prime" e "Amazon Prime Video"
  { match: 'prime video',  display: 'Amazon Prime Video' },
  { match: 'globoplay',    display: 'Globoplay'           },
  { match: 'premiere',     display: 'Premiere'            },
  { match: 'caze tv',      display: 'Cazé TV'             },
  { match: 'cazetv',       display: 'Cazé TV'             },
  { match: 'ge tv',        display: 'Ge TV'               },
  { match: 'disney+',      display: 'Disney+'             },
  { match: 'disney +',     display: 'Disney+'             },
  { match: 'dazn',         display: 'DAZN'                },
  { match: 'tnt sports',   display: 'TNT Sports'          },
  { match: 'hbo max',      display: 'HBO Max'             },
  { match: 'star+',        display: 'Star+'               },
  { match: 'star +',       display: 'Star+'               },
];

// Mapa de estado (normalizado, sem acento) → sigla UF
const ESTADO_UF: Record<string, string> = {
  'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM',
  'bahia': 'BA', 'ceara': 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES',
  'goias': 'GO', 'maranhao': 'MA', 'mato grosso do sul': 'MS', 'mato grosso': 'MT',
  'minas gerais': 'MG', 'para': 'PA', 'paraiba': 'PB', 'parana': 'PR',
  'pernambuco': 'PE', 'piaui': 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN',
  'rio grande do sul': 'RS', 'rondonia': 'RO', 'roraima': 'RR',
  'santa catarina': 'SC', 'sao paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO',
};

// Aliases de nomes como aparecem nos artigos do ge.globo (vs. nomes normalizados da ESPN)
const TEAM_ALIASES: Record<string, string[]> = {
  'Atlético Mineiro':     ['Atlético-MG', 'Atletico-MG'],
  'Athletico Paranaense': ['Athletico', 'Athletico-PR'],
  'Red Bull Bragantino':  ['Bragantino', 'RB Bragantino'],
  'Sport Recife':         ['Sport'],
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function removeAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeForSearch(name: string): string {
  return removeAccents(name).toLowerCase().trim();
}

/** Retorna o nome do time e todos os aliases em forma normalizada. */
function teamVariants(name: string): string[] {
  return [name, ...(TEAM_ALIASES[name] ?? [])].map(normalizeForSearch);
}

function classifyChannels(transmissaoText: string): { canal: string[]; streaming: string[] } {
  const canal: string[] = [];
  const streaming: string[] = [];
  const text = removeAccents(transmissaoText).toLowerCase();

  // Globo regional: "Globo (São Paulo, Minas Gerais...)" → "Globo SP"
  const globoRegional = text.match(/\bglobo\s*\(([^)]+)\)/);
  if (globoRegional) {
    const firstState = globoRegional[1].split(',')[0].trim();
    const uf = ESTADO_UF[firstState];
    canal.push(uf ? `Globo ${uf}` : 'Globo');
  }

  for (const { match, display } of CANAIS_TV) {
    // Pula qualquer variante de Globo se já existe alguma (regional, TV Globo, ou genérica)
    const jaTemGlobo = canal.some(c => c.startsWith('Globo') || c === 'TV Globo');
    if ((match === 'globo' || match === 'tv globo') && jaTemGlobo) continue;
    if (text.includes(match) && !canal.includes(display)) canal.push(display);
  }
  for (const { match, display } of CANAIS_STREAMING) {
    if (text.includes(match) && !streaming.includes(display)) streaming.push(display);
  }

  // Qualquer Globo (regional ou nacional) implica Globoplay no streaming
  if (canal.some(c => c === 'TV Globo' || c.startsWith('Globo')) && !streaming.includes('Globoplay')) {
    streaming.unshift('Globoplay');
  }

  return { canal, streaming };
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, ms = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function fetchBodyText(url: string): Promise<string> {
  const res = await fetchWithTimeout(url, { headers: { ...FETCH_HEADERS, Accept: 'text/html' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  return $('body').text().replace(/\s+/g, ' ');
}

// ─── Busca na API do ge.globo ────────────────────────────────────────────────

interface SearchHit {
  url: string;
  title: string;
  isRodada: boolean;
}

async function buscarNaApi(query: string): Promise<SearchHit[]> {
  const body = [{
    search_profile: 'sp_ge_globo_com',
    query: 'ge.info_query_recency',
    params: { q: query, from: 0, size: 10, filterSpecies: true, species: SEARCH_SPECIES },
  }];

  const res = await fetchWithTimeout('https://busca.globo.com/v1/search', {
    method: 'POST',
    headers: {
      ...FETCH_HEADERS,
      'content-type': 'application/json',
      'x-tenant-id': 'ge',
      'x-must-thumborize': 'true',
      'origin': 'https://ge.globo.com',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) return [];

  const json: any = await res.json();
  const hits: any[] = json[0]?.result?.hits?.hits ?? [];
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  return hits.flatMap((hit: any) => {
    const source = hit._source ?? {};
    const url: string = source.url ?? '';
    const title: string = source.title ?? '';
    const publishedAt: string = source.published_at ?? source.publishedAt ?? '';

    if (!url) return [];
    if (publishedAt && new Date(publishedAt).getTime() < sevenDaysAgo) return [];

    const titleNorm = removeAccents(title).toLowerCase();
    const isRodada = titleNorm.includes('onde assistir') &&
      (titleNorm.includes('rodada') || titleNorm.includes('jogos da'));

    return [{ url, title, isRodada }];
  });
}

// ─── Extração de transmissão ─────────────────────────────────────────────────

/** Extrai transmissão de matéria individual. */
function extrairDeMateria(bodyText: string): { canal: string[]; streaming: string[] } | null {
  // Padrão 1: "Transmissão: SporTV e Premiere"
  const matchLabel = bodyText.match(/Transmiss[aã]o[:\s]+([^.;]{5,300})/i);
  if (matchLabel) {
    const result = classifyChannels(matchLabel[1]);
    if (result.canal.length > 0 || result.streaming.length > 0) return result;
  }

  // Padrão 2: frases livres — "A ESPN e o Disney+ também transmitem a partida ao vivo."
  for (const sentence of bodyText.split(/[.!?]\s+/)) {
    const lower = sentence.toLowerCase();
    if (lower.includes('transmi') && lower.includes('ao vivo')) {
      const result = classifyChannels(sentence);
      if (result.canal.length > 0 || result.streaming.length > 0) return result;
    }
  }

  return null;
}

/**
 * Extrai transmissão de artigo de rodada buscando a seção do jogo específico.
 * Suporta aliases de nomes (ex: "Atlético-MG" para "Atlético Mineiro").
 * Reutiliza o bodyText já carregado para evitar re-fetches.
 */
function extrairDeRodada(
  bodyText: string,
  mandante: string,
  visitante: string,
): { canal: string[]; streaming: string[] } | null {
  const textNorm = removeAccents(bodyText).toLowerCase();
  const mandVariants = teamVariants(mandante);
  const visitVariants = teamVariants(visitante);

  const sectionsNorm = textNorm.split(/jogo:/i);
  const sectionsOrig = bodyText.split(/Jogo:/i);

  for (let i = 1; i < sectionsNorm.length; i++) {
    const sectionNorm = sectionsNorm[i].substring(0, 600);

    const hasMandante = mandVariants.some(v => sectionNorm.includes(v));
    const hasVisitante = visitVariants.some(v => sectionNorm.includes(v));
    if (!hasMandante || !hasVisitante) continue;

    const sectionOrig = (sectionsOrig[i] ?? '').substring(0, 600);
    const match = sectionOrig.match(/Transmiss[aã]o[:\s]+([^;.]{5,300})/i);
    if (!match) continue;

    const result = classifyChannels(match[1]);
    if (result.canal.length > 0 || result.streaming.length > 0) return result;
  }

  return null;
}

/** Extrai o número da rodada da URL ou do texto do artigo. */
function extrairNumeroRodada(url: string, bodyText: string): number {
  const fromUrl = url.match(/[^\d](\d{1,2})[a-z]?-rodada/);
  if (fromUrl) return parseInt(fromUrl[1]);
  const fromText = bodyText.match(/(\d{1,2})[\s\u00AA°]*rodada/i);
  if (fromText) return parseInt(fromText[1]);
  return 0;
}

// ─── API pública ─────────────────────────────────────────────────────────────

export interface DadosRodada {
  /** Número da rodada extraído do artigo (0 se não encontrado). */
  rodada: number;
  /** URL do artigo de rodada. */
  url: string;
  /**
   * Busca a transmissão de um jogo específico no artigo de rodada já carregado.
   * Não faz requisições adicionais.
   */
  buscarTransmissao(mandante: string, visitante: string): { canal: string[]; streaming: string[] } | null;
}

/**
 * Busca o artigo de rodada do Brasileirão usando o primeiro fixture como âncora.
 * Retorna null se não encontrar o artigo de rodada.
 *
 * Eficiência: faz apenas 1 chamada à API de busca + 1 fetch do artigo,
 * independentemente do número de jogos.
 */
export async function buscarDadosRodada(
  fixtures: Array<{ timeMandante: string; timeVisitante: string }>,
): Promise<DadosRodada | null> {
  if (fixtures.length === 0) return null;

  // Usa o primeiro fixture como âncora para encontrar o artigo de rodada
  const { timeMandante, timeVisitante } = fixtures[0];
  const query = `onde assistir ${normalizeForSearch(timeMandante)} x ${normalizeForSearch(timeVisitante)}`;

  console.log(`\n── Artigo de rodada ──`);
  console.log(`   âncora: "${timeMandante} x ${timeVisitante}"`);
  console.log(`   query: "${query}"`);

  const hits = await buscarNaApi(query);
  console.log(`   ${hits.length} hit(s) encontrado(s):`);
  for (const h of hits) {
    const icone = h.isRodada ? '  ✓ [rodada]' : '  ✗ [individual]';
    console.log(`${icone} "${h.title}"`);
    console.log(`         ${h.url}`);
  }

  const rodadaHit = hits.find(h => h.isRodada);
  if (!rodadaHit) {
    console.log('   → nenhum artigo de rodada — usando busca individual por jogo');
    return null;
  }

  console.log(`   lendo: ${rodadaHit.url}`);
  const bodyText = await fetchBodyText(rodadaHit.url);
  const rodada = extrairNumeroRodada(rodadaHit.url, bodyText);
  console.log(`   → Rodada ${rodada || '?'} extraída`);

  return {
    rodada,
    url: rodadaHit.url,
    buscarTransmissao: (mandante, visitante) => extrairDeRodada(bodyText, mandante, visitante),
  };
}

/**
 * Fallback: busca matéria individual de um jogo específico.
 * Usar quando o jogo não estiver no artigo de rodada.
 */
export async function buscarOndeAssistir(
  mandante: string,
  visitante: string,
): Promise<{ canal: string[]; streaming: string[] }> {
  const label = `${mandante} x ${visitante}`;
  try {
    const mand = normalizeForSearch(mandante);
    const visit = normalizeForSearch(visitante);

    // Tenta ordem direta e invertida para cobrir artigos como "Santos x Deportivo Cuenca"
    const queries = [
      `onde assistir ${mand} x ${visit}`,
      `onde assistir ${visit} x ${mand}`,
    ];

    console.log(`\n🔍 [scrape] ${label}`);

    let hits: SearchHit[] = [];
    let queryUsada = '';
    for (const query of queries) {
      hits = await buscarNaApi(query);
      queryUsada = query;
      console.log(`   query: "${query}" → ${hits.length} hit(s)`);
      if (hits.length > 0) break;
    }

    // Filtra matérias individuais: precisa de "onde assistir" + os dois times no título
    // Usa teamVariants para cobrir aliases (ex: "Bragantino" → "Red Bull Bragantino")
    const mandVariants = teamVariants(mandante);
    const visitVariants = teamVariants(visitante);

    const individuais = hits.filter(h => {
      const t = removeAccents(h.title).toLowerCase();
      const temOndeAssistir = t.includes('onde assistir');
      const temMandante = mandVariants.some(v => t.includes(v));
      const temVisitante = visitVariants.some(v => t.includes(v));
      const aceito = temOndeAssistir && temMandante && temVisitante;

      const motivo = !temOndeAssistir
        ? 'sem "onde assistir"'
        : !temMandante && !temVisitante
          ? 'sem nenhum dos times'
          : !temMandante
            ? `sem mandante (${mandante})`
            : `sem visitante (${visitante})`;
      const icone = aceito ? '  ✓' : '  ✗';
      console.log(`${icone} "${h.title}"`);
      if (!aceito) console.log(`       motivo: ${motivo}`);
      console.log(`       ${h.url}`);

      return aceito;
    });

    if (individuais.length === 0) {
      console.log(`   → nenhuma matéria aceita`);
    }

    for (const hit of individuais) {
      try {
        console.log(`   lendo: ${hit.url}`);
        const bodyText = await fetchBodyText(hit.url);
        const result = extrairDeMateria(bodyText);
        if (result) {
          const channels = [...result.canal, ...result.streaming].join(', ');
          console.log(`   → extraiu: ${channels}`);
          console.log(`✅ [scrape]  ${label} → ${channels}`);
          return result;
        }
        console.log(`   → sem padrão "Transmissão:" no artigo`);
      } catch (e) {
        console.log(`   → erro ao ler: ${String(e)}`);
      }
    }

    console.log(`⚠️  [scrape]  ${label} — sem transmissão encontrada`);
    return { canal: [], streaming: [] };
  } catch (err: unknown) {
    const reason = err instanceof Error && err.name === 'AbortError' ? 'timeout' : String(err);
    console.log(`❌ [scrape]  ${label} — ${reason}`);
    return { canal: [], streaming: [] };
  }
}
