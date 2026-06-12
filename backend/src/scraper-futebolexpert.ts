/**
 * Scraper do FutebolExpert para obter canais de transmissão dos jogos da Copa 2026.
 * Uso: npx ts-node src/scraper-futebolexpert.ts
 *
 * Busca a página /onde-assistir/copa-do-mundo/todos-os-canais, extrai jogos + canais
 * e atualiza os campos `canal` e `streaming` nos documentos Firestore da coleção `jogos`.
 */
import 'dotenv/config';
import * as cheerio from 'cheerio';
import { db } from './firebase';

const URL_FUTEBOLEXPERT = 'https://www.futebolexpert.com.br/onde-assistir/copa-do-mundo/todos-os-canais';

// Canais de streaming conhecidos (resto vai para `canal`)
const STREAMING_KEYWORDS = [
  'cazétv', 'cazé', 'youtube', 'disney+', 'disney plus', 'max', 'hbo max',
  'paramount+', 'paramount plus', 'amazon', 'prime video', 'apple tv', 'dazn',
  'fubo', 'peacock', 'tubi', 'star+', 'star plus', 'espn+',
];

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Variantes conhecidas de nomes de times para facilitar o matching
const ALIASES: Record<string, string> = {
  'estados unidos': 'estados unidos',
  'eua': 'estados unidos',
  'usa': 'estados unidos',
  'coreia': 'coreia do sul',
  'republica tcheca': 'rep. tcheca',
  'rep tcheca': 'rep. tcheca',
  'czech republic': 'rep. tcheca',
  'africa do sul': 'africa do sul',
  'africa': 'africa do sul',
  'gra-bretanha': 'gra-bretanha',
  'gra bretanha': 'gra-bretanha',
  'gran bretanha': 'gra-bretanha',
  'nova zelandia': 'nova zelandia',
  'arabia saudita': 'arabia saudita',
};

function resolverNome(raw: string): string {
  const n = normalizar(raw);
  return ALIASES[n] ?? n;
}

function isStreaming(canal: string): boolean {
  const n = normalizar(canal);
  return STREAMING_KEYWORDS.some(k => n.includes(k));
}

function classificarCanais(canais: string[]): { canal: string[]; streaming: string[] } {
  const canal: string[] = [];
  const streaming: string[] = [];
  for (const c of canais) {
    if (isStreaming(c)) streaming.push(c);
    else canal.push(c);
  }
  return { canal, streaming };
}

interface JogoCanais {
  timeMandante: string;
  timeVisitante: string;
  canais: string[];
}

async function fetchHtml(): Promise<string> {
  const resp = await fetch(URL_FUTEBOLEXPERT, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ao acessar FutebolExpert`);
  return resp.text();
}

function parsearJogos(html: string): JogoCanais[] {
  const $ = cheerio.load(html);
  const jogos: JogoCanais[] = [];

  // Estrutura do futebolexpert: tabela com colunas Data | Horário | Confronto | Onde assistir | Fase
  // Extrair por índice de célula para não confundir nomes de times com canais
  $('table tbody tr, table tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 4) return;

    // Coluna 2: Confronto (ex: "Catar x Suíça")
    const confronto = cells.eq(2).text().trim();
    const vsMatch = confronto.match(/^([A-Za-zÀ-ú\s.'()-]+?)\s+[xX×]\s+([A-Za-zÀ-ú\s.'()-]+)$/);
    if (!vsMatch) return;

    const mandante = vsMatch[1].trim();
    const visitante = vsMatch[2].trim();
    if (mandante.length < 2 || visitante.length < 2) return;

    // Coluna 3: Onde assistir — extrair canais de <a>, <img alt>, ou texto
    const ondeCell = cells.eq(3);
    const canais: string[] = [];

    ondeCell.find('a').each((_, a) => {
      const t = $(a).text().trim();
      if (t.length > 1) canais.push(t);
    });

    if (canais.length === 0) {
      ondeCell.find('img').each((_, img) => {
        const alt = ($(img).attr('alt') ?? $(img).attr('title') ?? '').trim();
        if (alt.length > 1) canais.push(alt);
      });
    }

    if (canais.length === 0) {
      ondeCell.text().trim().split(/[,|\n\/]+/).forEach(c => {
        const t = c.trim();
        if (t.length > 1) canais.push(t);
      });
    }

    console.log(`  [parse] ${mandante} x ${visitante} → [${canais.join(', ') || 'sem canais'}]`);
    jogos.push({ timeMandante: mandante, timeVisitante: visitante, canais });
  });

  if (jogos.length === 0) {
    console.warn('  [parse] Nenhum jogo encontrado — verificar estrutura HTML.');
    console.log('  [debug] Primeiros 3000 chars do HTML:');
    console.log(html.slice(0, 3000));
  }

  return jogos;
}

async function buscarJogosFirestore(): Promise<Map<string, { id: string; canal: string[]; streaming: string[] }>> {
  const snap = await db.collection('jogos').where('campeonato', '==', 'Copa do Mundo 2026').get();
  const mapa = new Map<string, { id: string; canal: string[]; streaming: string[] }>();
  for (const doc of snap.docs) {
    const d = doc.data();
    const chave = `${resolverNome(d.timeMandante)}|${resolverNome(d.timeVisitante)}`;
    mapa.set(chave, { id: doc.id, canal: d.canal ?? [], streaming: d.streaming ?? [] });
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

  const jogosPorNome = await buscarJogosFirestore();
  console.log(`  Jogos no Firestore (Copa 2026): ${jogosPorNome.size}`);

  const batch = db.batch();
  let atualizados = 0;
  let erros = 0;

  for (const jogo of jogosExtraidos) {
    const mandNorm  = resolverNome(jogo.timeMandante);
    const visitNorm = resolverNome(jogo.timeVisitante);
    const chave = `${mandNorm}|${visitNorm}`;
    const chaveInv = `${visitNorm}|${mandNorm}`;

    const doc = jogosPorNome.get(chave) ?? jogosPorNome.get(chaveInv);
    if (!doc) {
      console.warn(`  ⚠ Sem match Firestore: "${jogo.timeMandante}" x "${jogo.timeVisitante}"`);
      erros++;
      continue;
    }

    if (jogo.canais.length === 0) {
      console.log(`  – Sem canais para: ${jogo.timeMandante} x ${jogo.timeVisitante}`);
      continue;
    }

    const { canal, streaming } = classificarCanais(jogo.canais);
    batch.update(db.collection('jogos').doc(doc.id), { canal, streaming });
    atualizados++;
    console.log(`  ✅ ${jogo.timeMandante} x ${jogo.timeVisitante} → canal: [${canal}] | streaming: [${streaming}]`);
  }

  if (atualizados > 0) await batch.commit();

  console.log(`\n  Resultado: ${atualizados} atualizado(s), ${erros} erro(s) de matching`);
  return { atualizados, erros };
}

// Execução standalone
scrapeCanaisFutebolExpert()
  .then(() => { process.exitCode = 0; })
  .catch(err => {
    console.error('Erro no scraper:', err);
    process.exitCode = 1;
  });
