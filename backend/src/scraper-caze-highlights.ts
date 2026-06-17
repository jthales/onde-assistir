/**
 * Scraper do canal CazéTV no YouTube para melhores momentos da Copa 2026.
 *
 * Usa fetch direto em vez de Puppeteer — ytInitialData é server-side rendered no HTML,
 * então não precisamos de browser. Evita bot detection em ambientes CI.
 *
 * Título esperado: "MELHORES MOMENTOS: ÁUSTRIA 3 X 1 JORDÂNIA | COPA DO MUNDO FIFA™ 2026 | ..."
 * lockupViewModel (2024+): richItemRenderer.content.lockupViewModel.contentId / .metadata...title.content
 */
import 'dotenv/config';

// Dev local (Windows + antivírus que intercepta TLS): desativa verificação SSL
if (process.env['ALLOW_INSECURE_TLS'] === 'true') {
  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
}

import { getDb } from './mongodb';
import { COUNTRY_NAMES_PT } from './country-names';

const CAZE_VIDEOS_URL = 'https://www.youtube.com/@CazeTV/videos';
const DEFAULT_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const DEBUG = process.argv.includes('--debug');

// Português: "MELHORES MOMENTOS: ÁUSTRIA 3 X 1 JORDÂNIA |"
const HIGHLIGHT_REGEX =
  /MELHORES MOMENTOS[:\s]+(.+?)\s+\d+(?:\s*\(\d+\))?\s*[xX]\s*(?:\(\d+\)\s*)?\d+\s+(.+?)\s*\|/i;

// Inglês: "HIGHLIGHTS: GERMANY 7-1 CURACAO |" ou "HIGHLIGHTS: IRAN 2 X 2 NEW ZEALAND |"
const HIGHLIGHT_REGEX_EN =
  /^HIGHLIGHTS:\s+(.+?)\s+\d+(?:\s*-\s*|\s+[xX]\s+)\d+\s+(.+?)\s*\|/i;

// Copa 2026 — filtra por formato português OU inglês; exclui Copas anteriores e amistosos
const IS_COPA = /(?:COPA DO MUNDO|FIFA WORLD CUP).*2026|2026.*(?:COPA DO MUNDO|FIFA WORLD CUP)/i;

interface VideoItem {
  videoId: string;
  title: string;
}

interface Highlight {
  title: string;
  url: string;
  team1: string;
  team2: string;
}

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

const TEAM_ALIASES: Record<string, string[]> = {
  // Rep. Tcheca: ESPN usa "Rep. Tcheca", CazéTV usa "Tchéquia"
  'tchequia':         ['rep. tcheca', 'republica tcheca'],
  'rep. tcheca':      ['tchequia', 'republica tcheca'],
  'republica tcheca': ['tchequia', 'rep. tcheca'],

  // Irã: normalizar("Irã") → "ira", mas CazéTV pode usar "IRAN" → "iran"
  'ira':  ['iran'],
  'iran': ['ira'],

  // Holanda: ESPN usa "Holanda", FIFA/CazéTV pode usar "Países Baixos"
  'holanda':      ['paises baixos', 'netherlands', 'países baixos'],
  'paises baixos': ['holanda'],

  // Gana: banco usa "Gana" (pt-BR), CazéTV pode usar "Ghana" (inglês)
  'gana':  ['ghana'],
  'ghana': ['gana'],

  // RD Congo: variações comuns
  'rd congo':                   ['congo', 'rep. democratica do congo', 'republica democratica do congo', 'republica dem. do congo'],
  'congo':                      ['rd congo', 'rep. democratica do congo'],
  'rep. democratica do congo':  ['rd congo', 'congo'],

  // Bósnia: banco usa "Bósnia", CazéTV pode usar "Bósnia-Herzegovina"
  'bosnia':              ['bosnia-herzegovina', 'bosnia e herzegovina', 'bosnia herzegovina'],
  'bosnia-herzegovina':  ['bosnia'],
  'bosnia e herzegovina':['bosnia'],
};

// Traduz nomes em inglês (usados nos títulos HIGHLIGHTS: do CazéTV) para o PT do nosso banco.
// Construído a partir de COUNTRY_NAMES_PT + extras específicos do CazéTV.
const EN_TO_PT_MAP: Record<string, string> = {};
for (const [en, pt] of Object.entries(COUNTRY_NAMES_PT)) {
  EN_TO_PT_MAP[normalizar(en)] = pt;
}
Object.assign(EN_TO_PT_MAP, {
  'turkey':                           'Turquia',      // ESPN usa "Türkiye"
  'curacao':                          'Curaçao',      // sem cedilha
  'bosnia and herzegovina':           'Bósnia',
  'bosnia':                           'Bósnia',
  'czech republic':                   'Rep. Tcheca',
  'ivory coast':                      'Costa do Marfim',
  'dr congo':                         'RD Congo',
  'democratic republic of the congo': 'RD Congo',
  'usa':                              'Estados Unidos',
  'ghana':                            'Gana',
  'turkiye':                          'Turquia',
});

function traduzirTimeEN(name: string): string {
  return EN_TO_PT_MAP[normalizar(name)] ?? name;
}

function nomesCoincide(a: string, b: string): boolean {
  const n1 = normalizar(a);
  const n2 = normalizar(b);
  if (n1 === n2) return true;
  if (n1.length >= 4 && n2.includes(n1)) return true;
  if (n2.length >= 4 && n1.includes(n2)) return true;
  const alt1 = TEAM_ALIASES[n1] ?? [];
  const alt2 = TEAM_ALIASES[n2] ?? [];
  return alt1.includes(n2) || alt2.includes(n1);
}

// ── Extrai JSON de HTML rastreando profundidade de chaves ─────────────────────
// Mais robusto que regex para objetos grandes com caracteres especiais.

function extractJsonFromHtml(html: string, marker: string): any {
  const idx = html.indexOf(marker);
  if (idx === -1) return null;

  let i = idx + marker.length;
  let depth = 0;
  let inStr = false;
  let escape = false;
  const start = i;

  for (; i < html.length; i++) {
    const ch = html[i];
    if (escape) { escape = false; continue; }
    if (inStr) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    if (ch === '}') { depth--; if (depth === 0) { i++; break; } }
  }

  try {
    return JSON.parse(html.slice(start, i));
  } catch {
    return null;
  }
}

// ── Busca a página do canal com fetch (sem Puppeteer) ─────────────────────────

async function fetchChannelHtml(): Promise<string> {
  const resp = await fetch(CAZE_VIDEOS_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      // SOCS: bypass do diálogo de consentimento GDPR do YouTube
      'Cookie': 'SOCS=CAESEwgDEgk2NDE3MTUyMTYaAmVuIAEaBgiAgI2nBg; GPS=1',
    },
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status} ao buscar canal CazéTV`);

  const html = await resp.text();

  if (!html.includes('ytInitialData')) {
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? '(sem título)';
    const isConsent =
      html.includes('consent.youtube.com') ||
      html.includes('consentRequired') ||
      html.includes('SOCS');
    throw new Error(
      `ytInitialData não encontrado no HTML.\n` +
      `  Título da página: "${title}"\n` +
      `  Parece página de consentimento: ${isConsent}\n` +
      `  Primeiros 300 chars: ${html.slice(0, 300)}`
    );
  }

  return html;
}

// ── Parse de lista de vídeos do ytInitialData / resposta de continuação ───────

function extrairVideosEToken(contents: any[]): { videos: VideoItem[]; continuationToken: string | null } {
  const videos: VideoItem[] = [];
  let continuationToken: string | null = null;

  for (const item of contents ?? []) {
    // Formato atual (2024+): lockupViewModel
    const lvm = item?.richItemRenderer?.content?.lockupViewModel
              ?? item?.gridVideoRenderer;

    if (lvm?.contentId) {
      const title =
        lvm.metadata?.lockupMetadataViewModel?.title?.content
        ?? lvm.title?.runs?.map((r: any) => r.text).join('')
        ?? lvm.title?.simpleText
        ?? '';
      if (title) videos.push({ videoId: lvm.contentId, title });
    } else {
      // Fallback: videoRenderer (formato anterior)
      const vr = item?.richItemRenderer?.content?.videoRenderer;
      if (vr?.videoId) {
        const title = vr.title?.runs?.map((r: any) => r.text).join('') ?? vr.title?.simpleText ?? '';
        if (title) videos.push({ videoId: vr.videoId, title });
      }
    }

    // Token de paginação
    const tok =
      item?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token
      ?? item?.continuationItemRenderer?.button?.buttonRenderer?.command?.continuationCommand?.token;
    if (tok) continuationToken = tok;
  }

  return { videos, continuationToken };
}

function parsearYtInitialData(ytData: any): { videos: VideoItem[]; continuationToken: string | null } {
  try {
    const tabs: any[] = ytData?.contents?.twoColumnBrowseResultsRenderer?.tabs ?? [];

    for (const tab of tabs) {
      const contents = tab?.tabRenderer?.content?.richGridRenderer?.contents;
      if (contents?.length) return extrairVideosEToken(contents);

      // Layout antigo: sectionListRenderer > gridRenderer
      const slr = tab?.tabRenderer?.content?.sectionListRenderer?.contents;
      if (slr) {
        for (const sec of slr) {
          const items = sec?.itemSectionRenderer?.contents?.[0]?.gridRenderer?.items;
          if (items?.length) return extrairVideosEToken(items);
        }
      }
    }
  } catch (err) {
    console.warn('Erro ao parsear ytInitialData:', err);
  }
  return { videos: [], continuationToken: null };
}

// ── Paginação via Innertube browse API ────────────────────────────────────────

async function carregarMaisVideos(
  continuationToken: string,
  apiKey: string,
  visitorData: string
): Promise<{ videos: VideoItem[]; continuationToken: string | null }> {
  try {
    const resp = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': '2.20240617.01.00',
      },
      body: JSON.stringify({
        continuation: continuationToken,
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240617.01.00',
            visitorData: visitorData || undefined,
          },
        },
      }),
    });

    if (!resp.ok) {
      console.warn(`Innertube browse retornou ${resp.status}`);
      return { videos: [], continuationToken: null };
    }

    const data: any = await resp.json();
    const items: any[] =
      data?.onResponseReceivedActions?.[0]?.appendContinuationItemsAction?.continuationItems ?? [];

    return extrairVideosEToken(items);
  } catch (err) {
    console.warn('Erro na API de continuação:', err);
    return { videos: [], continuationToken: null };
  }
}

// ── Scraper principal ─────────────────────────────────────────────────────────

async function scrapeYouTubeHighlights(): Promise<Highlight[]> {
  console.log(`Buscando ${CAZE_VIDEOS_URL}...`);

  const html = await fetchChannelHtml();

  const ytData = extractJsonFromHtml(html, 'var ytInitialData = ');
  if (!ytData) throw new Error('Falha ao parsear ytInitialData do HTML');

  const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] ?? DEFAULT_API_KEY;
  const visitorData = html.match(/"VISITOR_DATA":"([^"]+)"/)?.[1] ?? '';

  const parsed = parsearYtInitialData(ytData);
  let allVideos: VideoItem[] = parsed.videos;
  let contToken = parsed.continuationToken;

  console.log(`Batch inicial: ${allVideos.length} vídeos`);

  const MAX_BATCHES = 25;
  const PARAR_APOS_VAZIOS = 3;
  let batchNum = 2;
  let batchesVaziosCopa = 0;

  while (contToken && batchNum <= MAX_BATCHES && batchesVaziosCopa < PARAR_APOS_VAZIOS) {
    const more = await carregarMaisVideos(contToken, apiKey, visitorData);

    const highlightsCopa = more.videos.filter(v =>
      IS_COPA.test(v.title) && (HIGHLIGHT_REGEX.test(v.title) || HIGHLIGHT_REGEX_EN.test(v.title))
    ).length;

    console.log(`Batch ${batchNum}: ${more.videos.length} vídeos, ${highlightsCopa} highlights Copa`);

    allVideos = allVideos.concat(more.videos);
    contToken = more.continuationToken;
    batchNum++;

    if (highlightsCopa === 0) batchesVaziosCopa++;
    else batchesVaziosCopa = 0;

    await new Promise(r => setTimeout(r, 600));
  }

  const motivo = !contToken
    ? 'sem mais conteúdo'
    : batchesVaziosCopa >= PARAR_APOS_VAZIOS
    ? `${PARAR_APOS_VAZIOS} batches sem highlights Copa`
    : `limite de ${MAX_BATCHES} batches`;
  console.log(`\nTotal analisado: ${allVideos.length} vídeos em ${batchNum - 1} batches (parou: ${motivo})`);

  if (DEBUG) {
    console.log('\n── Todos os títulos encontrados ──');
    allVideos.forEach((v, i) => console.log(`  [${i + 1}] ${v.title}`));
    console.log('──────────────────────────────────\n');
  }

  const highlights: Highlight[] = [];
  for (const v of allVideos) {
    if (!IS_COPA.test(v.title)) continue;

    const ptMatch = v.title.match(HIGHLIGHT_REGEX);
    const enMatch = ptMatch ? null : v.title.match(HIGHLIGHT_REGEX_EN);

    let team1: string | undefined;
    let team2: string | undefined;

    if (ptMatch) {
      team1 = ptMatch[1].trim();
      team2 = ptMatch[2].trim();
    } else if (enMatch) {
      team1 = traduzirTimeEN(enMatch[1].trim());
      team2 = traduzirTimeEN(enMatch[2].trim());
    }

    if (!team1 || !team2) {
      if (DEBUG) console.log(`  ℹ️  Copa sem match de times: "${v.title}"`);
      continue;
    }

    highlights.push({
      title: v.title,
      url: `https://www.youtube.com/watch?v=${v.videoId}`,
      team1,
      team2,
    });
    console.log(`  🎬 Highlight: "${v.title}"`);
  }

  return highlights;
}

// ── Cruzar com MongoDB e salvar ────────────────────────────────────────────────

async function salvarHighlights(highlights: Highlight[]): Promise<void> {
  if (highlights.length === 0) {
    console.log('Nenhum highlight Copa encontrado.');
    return;
  }

  const db = await getDb();
  const jogosCol = db.collection('jogos');
  const jogos = await jogosCol.find({ campeonato: 'Copa do Mundo 2026' }).toArray();

  console.log(`\nCruzando ${highlights.length} highlights com ${jogos.length} jogos Copa 2026...`);

  let atualizados = 0;
  let semMatch = 0;

  for (const h of highlights) {
    let matched = false;

    for (const jogo of jogos) {
      const mandante = jogo['timeMandante'] as string;
      const visitante = jogo['timeVisitante'] as string;

      const normal    = nomesCoincide(h.team1, mandante)  && nomesCoincide(h.team2, visitante);
      const invertido = nomesCoincide(h.team1, visitante) && nomesCoincide(h.team2, mandante);

      if (normal || invertido) {
        await jogosCol.updateOne(
          { _id: jogo['_id'] },
          { $set: { melhoresMomentos: h.url } }
        );
        console.log(`✅ ${mandante} × ${visitante} → ${h.url}`);
        atualizados++;
        matched = true;
        break;
      }
    }

    if (!matched) {
      console.log(`⚠️  Sem match: "${h.team1}" × "${h.team2}" | título: "${h.title}"`);
      semMatch++;
    }
  }

  console.log(`\nResumo: ${atualizados} atualizados, ${semMatch} sem match.`);
}

// ── Cache bust ─────────────────────────────────────────────────────────────────

async function invalidarCache(): Promise<void> {
  const backendUrl = process.env['BACKEND_URL'];
  const adminSecret = process.env['ADMIN_SECRET'];
  if (!backendUrl || !adminSecret) {
    console.log('BACKEND_URL ou ADMIN_SECRET não configurados — pulando cache bust.');
    return;
  }
  try {
    const resp = await fetch(`${backendUrl}/api/admin/invalidar-cache-copa`, {
      method: 'POST',
      headers: { 'x-admin-secret': adminSecret, 'Content-Type': 'application/json' },
    });
    console.log(resp.ok ? 'Cache Copa invalidado.' : `Cache bust retornou ${resp.status}.`);
  } catch (err) {
    console.warn('Falha ao invalidar cache:', err);
  }
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n──── Scraper CazéTV Melhores Momentos — ${new Date().toISOString()} ────\n`);
  try {
    const highlights = await scrapeYouTubeHighlights();
    await salvarHighlights(highlights);
    await invalidarCache();
  } catch (err) {
    console.error('Erro no scraper:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();
