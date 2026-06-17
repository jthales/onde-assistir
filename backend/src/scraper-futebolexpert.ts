/**
 * Scraper do FutebolExpert para obter canais de transmissão dos jogos da Copa 2026.
 * Usa Puppeteer para renderizar o JavaScript da página e obter todos os jogos.
 * Uso: npx ts-node src/scraper-futebolexpert.ts
 */
import 'dotenv/config';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { getDb } from './mongodb';

const URL_FUTEBOLEXPERT = 'https://www.futebolexpert.com.br/onde-assistir/copa-do-mundo/todos-os-canais';

// Normaliza nome do canal para comparação e classificação
function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

// Mapa de variações de nome do site → nome canônico usado no app
const CANAL_NOME_MAP: Record<string, string> = {
  'tv globo':                 'Globo',
  'globo':                    'Globo',
  'sbt':                      'SBT',
  'sportv':                   'SporTV',
  'sporttv':                  'SporTV',
  'sportv 2':                 'SporTV 2',
  'sportv 3':                 'SporTV 3',
  'nsports':                  'Nsports',
  'band':                     'Band',
  'record':                   'Record',
  'record tv':                'Record',
  'ge tv':                    'Ge TV',
  'ge tv (no globoplay)':     'Ge TV',
  'globoplay':                'Globoplay',
  'prime video':              'Prime Video',
  'amazon prime video':       'Prime Video',
  'cazetv':                   'CazéTV',
  'caze tv':                  'CazéTV',
  'cazé tv':                  'CazéTV',
  'cazétv':                   'CazéTV',
  'disney+':                  'Disney+',
  'dazn':                     'DAZN',
  'paramount+':               'Paramount+',
  'espn':                     'ESPN',
  'espn brasil':              'ESPN',
};

function normalizarNomeCanal(raw: string): string {
  const key = normalizar(raw);
  return CANAL_NOME_MAP[key] ?? raw.trim();
}

// Canais que são streaming (resto vai para `canal` = TV)
const STREAMING_KEYWORDS = [
  'cazétv', 'cazé', 'cazetv', 'youtube', 'disney+', 'disney plus', 'max', 'hbo max',
  'paramount+', 'paramount plus', 'amazon', 'prime video', 'apple tv', 'dazn',
  'fubo', 'peacock', 'tubi', 'star+', 'star plus', 'espn+',
  'globoplay', 'ge tv', 'nsports',
];

function isStreaming(canal: string): boolean {
  const n = normalizar(canal);
  return STREAMING_KEYWORDS.some(k => n.includes(k));
}

function classificarCanais(canais: string[]): { canal: string[]; streaming: string[] } {
  const canal: string[] = [];
  const streaming: string[] = [];
  for (const raw of canais) {
    const nome = normalizarNomeCanal(raw);
    if (isStreaming(nome)) streaming.push(nome);
    else canal.push(nome);
  }
  return { canal, streaming };
}

// Aliases de nomes de times do site → nome normalizado no Firestore
const ALIASES: Record<string, string> = {
  'estados unidos': 'estados unidos',
  'eua':            'estados unidos',
  'usa':            'estados unidos',
  'coreia do sul':  'coreia do sul',
  'coreia':         'coreia do sul',
  'republica tcheca': 'rep. tcheca',
  'rep tcheca':     'rep. tcheca',
  'czech republic': 'rep. tcheca',
  'africa do sul':  'africa do sul',
  'nova zelandia':  'nova zelandia',
  'arabia saudita': 'arabia saudita',
  // Nomes longos que o site usa mas Firestore usa forma curta
  'bosnia e herzegovina': 'bosnia',
  'bosnia-herzegovina':   'bosnia',
  'rd congo':             'rd congo',
  'r. d. congo':          'rd congo',
  'republica democratica do congo': 'rd congo',
  'uzbesquistao':         'uzbesquistao',
  // Curaçau (PT-BR do site) vs Curaçao (ESPN/Firestore)
  'curacau':              'curacao',
};

function resolverNome(raw: string): string {
  const n = normalizar(raw);
  return ALIASES[n] ?? n;
}

interface JogoCanais {
  timeMandante: string;
  timeVisitante: string;
  canais: string[];
}

async function fetchHtml(): Promise<string> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
    await page.goto(URL_FUTEBOLEXPERT, { waitUntil: 'networkidle2', timeout: 60_000 });

    // Aguarda ao menos uma linha aparecer antes de começar o scroll
    await page.waitForSelector('table tr, tr', { timeout: 15_000 }).catch(() => {});

    // Rola a página incrementalmente para disparar lazy-loading de todos os jogos,
    // aguardando a contagem de linhas estabilizar antes de capturar o HTML
    let prevRowCount = 0;
    let stableRounds = 0;
    const MAX_ROUNDS = 20;

    for (let i = 0; i < MAX_ROUNDS; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 1500));

      const rowCount: number = await page.evaluate(
        () => document.querySelectorAll('table tr, tr').length
      );

      if (rowCount === prevRowCount) {
        stableRounds++;
        if (stableRounds >= 3) {
          console.log(`  [fetch] Contagem estável em ${rowCount} linhas após ${i + 1} rodadas de scroll`);
          break;
        }
      } else {
        stableRounds = 0;
        console.log(`  [fetch] Scroll rodada ${i + 1}: ${prevRowCount} → ${rowCount} linhas`);
        prevRowCount = rowCount;
      }
    }

    // Volta ao topo e aguarda um momento final
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 500));

    const html = await page.content();
    console.log(`  [fetch] HTML final: ${html.length} chars`);
    return html;
  } finally {
    await browser.close();
  }
}

const VS_REGEX = /^([A-Za-zÀ-ú\s.'()\-]+?)\s+[xX×]\s+([A-Za-zÀ-ú\s.'()\-]+)$/;

function extrairCanaisDaCell($: cheerio.CheerioAPI, cell: cheerio.Element): string[] {
  const canais: string[] = [];
  const $cell = $(cell);

  $cell.find('a').each((_, a) => {
    $(a).text().trim().split(/,\s*/).forEach(part => {
      const p = part.trim();
      if (p.length > 1) canais.push(p);
    });
  });

  if (canais.length === 0) {
    $cell.find('img').each((_, img) => {
      const alt = ($(img).attr('alt') ?? $(img).attr('title') ?? '').trim();
      if (alt.length > 1) canais.push(alt);
    });
  }

  if (canais.length === 0) {
    $cell.text().trim().split(/,\s*/).forEach(c => {
      const t = c.trim();
      if (t.length > 1) canais.push(t);
    });
  }

  return canais;
}

function parsearPorTabela($: cheerio.CheerioAPI): JogoCanais[] {
  const jogos: JogoCanais[] = [];
  let totalRows = 0;
  let puladas = 0;

  $('table tbody tr, table tr').each((_, row) => {
    totalRows++;
    const cells = $(row).find('td');
    if (cells.length < 3) { puladas++; return; }

    // Tenta todas as combinações de coluna para o confronto (col 2 e col 1)
    for (const colConfronto of [2, 1, 0]) {
      const confronto = cells.eq(colConfronto).text().trim();
      const vsMatch = confronto.match(VS_REGEX);
      if (!vsMatch) continue;

      const mandante = vsMatch[1].trim();
      const visitante = vsMatch[2].trim();
      if (mandante.length < 2 || visitante.length < 2) continue;

      // Coluna seguinte = onde assistir
      const ondeCell = cells.get(colConfronto + 1);
      if (!ondeCell) continue;
      const canais = extrairCanaisDaCell($, ondeCell);

      console.log(`  [tabela] ${mandante} x ${visitante} → [${canais.join(', ') || 'sem canais'}]`);
      jogos.push({ timeMandante: mandante, timeVisitante: visitante, canais });
      break;
    }
  });

  console.log(`  [tabela] ${totalRows} linha(s) total, ${puladas} puladas (<3 cols), ${jogos.length} jogo(s) extraído(s)`);
  return jogos;
}

function parsearPorCards($: cheerio.CheerioAPI): JogoCanais[] {
  const jogos: JogoCanais[] = [];

  // Tenta encontrar confronto em qualquer elemento com padrão "Time x Time"
  $('*').each((_, el) => {
    const tag = (el as any).name ?? '';
    if (['script', 'style', 'head', 'noscript'].includes(tag)) return;
    const $el = $(el);
    if ($el.children().length > 0) return; // só folhas de texto

    const text = $el.text().trim();
    const vsMatch = text.match(VS_REGEX);
    if (!vsMatch) return;

    const mandante = vsMatch[1].trim();
    const visitante = vsMatch[2].trim();
    if (mandante.length < 2 || visitante.length < 2) return;

    // Procura canais no elemento pai/irmãos
    const $parent = $el.closest('[class]').parent();
    const canais = extrairCanaisDaCell($, $parent.get(0) as cheerio.Element);

    console.log(`  [cards] ${mandante} x ${visitante} → [${canais.join(', ') || 'sem canais'}]`);
    jogos.push({ timeMandante: mandante, timeVisitante: visitante, canais });
  });

  return jogos;
}

function parsearJogos(html: string): JogoCanais[] {
  const $ = cheerio.load(html);

  // Estratégia 1: tabela clássica
  let jogos = parsearPorTabela($);

  if (jogos.length < 5) {
    console.warn(`  [parse] Estratégia tabela retornou ${jogos.length} jogo(s) — tentando cards/divs`);

    // Estratégia 2: elementos genéricos com texto "X x Y"
    const cardJogos = parsearPorCards($);
    if (cardJogos.length > jogos.length) {
      console.log(`  [parse] Estratégia cards retornou ${cardJogos.length} jogo(s) — usando esses`);
      jogos = cardJogos;
    }
  }

  if (jogos.length === 0) {
    console.warn('  [parse] Nenhum jogo encontrado em nenhuma estratégia — dump do HTML para diagnóstico:');
    // Dump das primeiras 8000 chars e das tags de tabela encontradas
    console.log(`  [debug-html] ${html.slice(0, 8000)}`);
    const tables = $('table').length;
    const trs = $('tr').length;
    console.log(`  [debug-estrutura] tables=${tables} trs=${trs}`);
  } else {
    console.log(`  [parse] Total: ${jogos.length} jogo(s) extraído(s)`);
  }

  return jogos;
}

async function buscarJogosMongo(): Promise<Map<string, { id: string; canal: string[]; streaming: string[] }>> {
  const mdb = await getDb();
  const docs = await mdb.collection('jogos').find({ campeonato: 'Copa do Mundo 2026' }).toArray();
  const mapa = new Map<string, { id: string; canal: string[]; streaming: string[] }>();
  for (const doc of docs) {
    const chave = `${resolverNome(doc['timeMandante'])}|${resolverNome(doc['timeVisitante'])}`;
    mapa.set(chave, { id: doc['_id'] as unknown as string, canal: doc['canal'] ?? [], streaming: doc['streaming'] ?? [] });
  }
  return mapa;
}

export async function scrapeCanaisFutebolExpert(): Promise<{ atualizados: number; erros: number }> {
  console.log('\n── Scrape FutebolExpert Copa 2026 ──\n');

  const html = await fetchHtml();
  console.log(`  HTML recebido: ${html.length} chars`);

  const jogosExtraidos = parsearJogos(html);
  console.log(`  Jogos extraídos do site: ${jogosExtraidos.length}`);

  if (jogosExtraidos.length === 0) {
    console.warn('  ⚠ Nenhum jogo encontrado — verifique os seletores HTML.');
    return { atualizados: 0, erros: 0 };
  }

  const jogosPorNome = await buscarJogosMongo();
  console.log(`  Jogos no MongoDB (Copa 2026): ${jogosPorNome.size}`);

  const bulkOps: any[] = [];
  let atualizados = 0;
  let erros = 0;

  for (const jogo of jogosExtraidos) {
    const mandNorm  = resolverNome(jogo.timeMandante);
    const visitNorm = resolverNome(jogo.timeVisitante);
    const chave    = `${mandNorm}|${visitNorm}`;
    const chaveInv = `${visitNorm}|${mandNorm}`;

    const doc = jogosPorNome.get(chave) ?? jogosPorNome.get(chaveInv);
    if (!doc) {
      console.warn(`  ⚠ Sem match MongoDB: "${jogo.timeMandante}" x "${jogo.timeVisitante}" (norm: "${mandNorm}" | "${visitNorm}")`);
      erros++;
      continue;
    }

    if (jogo.canais.length === 0) {
      console.log(`  – Sem canais para: ${jogo.timeMandante} x ${jogo.timeVisitante}`);
      continue;
    }

    const { canal, streaming } = classificarCanais(jogo.canais);
    bulkOps.push({
      updateOne: {
        filter: { _id: doc.id } as any,
        update: { $set: { canal, streaming } },
      },
    });
    atualizados++;
    console.log(`  ✅ ${jogo.timeMandante} x ${jogo.timeVisitante} → canal: [${canal}] | streaming: [${streaming}]`);
  }

  if (atualizados > 0) {
    const mdb = await getDb();
    await mdb.collection('jogos').bulkWrite(bulkOps);
  }

  console.log(`\n  Resultado: ${atualizados} atualizado(s), ${erros} erro(s) de matching`);
  return { atualizados, erros };
}

// Execução standalone
scrapeCanaisFutebolExpert()
  .then(() => { process.exit(0); })
  .catch(err => {
    console.error('Erro no scraper:', err);
    process.exit(1);
  });
