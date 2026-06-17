/**
 * Scraper do canal CazéTV no YouTube para obter links dos melhores momentos dos jogos da Copa 2026.
 * O canal publica vídeos com títulos como:
 *   "MELHORES MOMENTOS: ÁUSTRIA 3 X 1 JORDÂNIA | COPA DO MUNDO FIFA™ 2026 | ..."
 *
 * O YouTube usa "lockupViewModel" desde 2024 — o path correto é:
 *   richItemRenderer.content.lockupViewModel.contentId  (videoId)
 *   richItemRenderer.content.lockupViewModel.metadata.lockupMetadataViewModel.title.content
 *
 * Uso:
 *   npx ts-node src/scraper-caze-highlights.ts          # modo normal
 *   npx ts-node src/scraper-caze-highlights.ts --debug  # loga todos os títulos encontrados
 */
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { getDb } from './mongodb';

const CAZE_VIDEOS_URL = 'https://www.youtube.com/@CazeTV/videos';
const DEBUG = process.argv.includes('--debug');

// Captura "MELHORES MOMENTOS: TIME1 SCORE TIME2 |"
// Aceita: "3 X 1", "0 x 0", "0 (5) X (3) 0" (pênaltis)
const HIGHLIGHT_REGEX =
  /MELHORES MOMENTOS[:\s]+(.+?)\s+\d+(?:\s*\(\d+\))?\s*[xX]\s*(?:\(\d+\)\s*)?\d+\s+(.+?)\s*\|/i;

// Apenas Copa 2026 — evita capturar highlights de Copas anteriores (2018, 2022...)
const IS_COPA = /COPA DO MUNDO.*2026|2026.*COPA DO MUNDO/i;

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

// Aliases para nomes que CazéTV usa de forma diferente do ESPN/DB
const TEAM_ALIASES: Record<string, string[]> = {
  'tchequia':       ['rep. tcheca', 'republica tcheca'],
  'rep. tcheca':    ['tchequia', 'republica tcheca'],
  'republica tcheca': ['tchequia', 'rep. tcheca'],
};

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

// ── Parsear lista de vídeos do ytInitialData / continuação ─────────────────────

function extrairVideosEToken(contents: any[]): { videos: VideoItem[]; continuationToken: string | null } {
  const videos: VideoItem[] = [];
  let continuationToken: string | null = null;

  for (const item of contents ?? []) {
    // Formato novo (2024+): lockupViewModel
    const lvm = item?.richItemRenderer?.content?.lockupViewModel
              ?? item?.gridVideoRenderer; // fallback antigo

    if (lvm?.contentId) {
      const title =
        lvm.metadata?.lockupMetadataViewModel?.title?.content // lockupViewModel
        ?? lvm.title?.runs?.map((r: any) => r.text).join('') // videoRenderer antigo
        ?? lvm.title?.simpleText
        ?? '';
      if (title) videos.push({ videoId: lvm.contentId, title });
    } else {
      // Também tentar videoRenderer antigo dentro de richItemRenderer
      const vr = item?.richItemRenderer?.content?.videoRenderer;
      if (vr?.videoId) {
        const title = vr.title?.runs?.map((r: any) => r.text).join('') ?? vr.title?.simpleText ?? '';
        if (title) videos.push({ videoId: vr.videoId, title });
      }
    }

    // Token de continuação
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

// ── Carregar mais vídeos via Innertube browse API ──────────────────────────────

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

// ── Puppeteer: carregar página e extrair dados ─────────────────────────────────

async function scrapeYouTubeHighlights(): Promise<Highlight[]> {
  console.log(`Abrindo ${CAZE_VIDEOS_URL}...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  let allVideos: VideoItem[] = [];
  let contToken: string | null = null;
  let apiKey = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
  let visitorData = '';

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 900 });

    await page.goto(CAZE_VIDEOS_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await new Promise(r => setTimeout(r, 4_000));

    const { ytData, ytApiKey, ytVisitorData } = await page.evaluate(() => ({
      ytData: (window as any).ytInitialData,
      ytApiKey: (window as any).ytcfg?.data_?.INNERTUBE_API_KEY ?? null,
      ytVisitorData: (window as any).ytcfg?.data_?.VISITOR_DATA ?? '',
    }));

    if (!ytData) {
      const title = await page.title();
      throw new Error(`ytInitialData não encontrado. Título da página: "${title}"`);
    }

    if (ytApiKey) apiKey = ytApiKey;
    visitorData = ytVisitorData;

    const parsed = parsearYtInitialData(ytData);
    allVideos = parsed.videos;
    contToken = parsed.continuationToken;

    console.log(`Batch inicial: ${allVideos.length} vídeos`);
  } finally {
    await browser.close();
  }

  // Carregar mais batches via API (sem Puppeteer)
  // Para quando 3 batches consecutivos não tiverem nenhum highlight Copa — evita varrer o canal inteiro
  const MAX_BATCHES = 25;
  const PARAR_APOS_VAZIOS = 3;
  let batchNum = 2;
  let batchesVaziosCopa = 0;

  while (contToken && batchNum <= MAX_BATCHES && batchesVaziosCopa < PARAR_APOS_VAZIOS) {
    const more = await carregarMaisVideos(contToken, apiKey, visitorData);

    const highlightsCopa = more.videos.filter(v =>
      IS_COPA.test(v.title) && HIGHLIGHT_REGEX.test(v.title)
    ).length;

    console.log(`Batch ${batchNum}: ${more.videos.length} vídeos, ${highlightsCopa} highlights Copa`);

    allVideos = allVideos.concat(more.videos);
    contToken = more.continuationToken;
    batchNum++;

    if (highlightsCopa === 0) {
      batchesVaziosCopa++;
    } else {
      batchesVaziosCopa = 0;
    }

    await new Promise(r => setTimeout(r, 600));
  }

  const motivo = !contToken ? 'sem mais conteúdo'
    : batchesVaziosCopa >= PARAR_APOS_VAZIOS ? `${PARAR_APOS_VAZIOS} batches sem highlights Copa`
    : `limite de ${MAX_BATCHES} batches`;
  console.log(`\nTotal analisado: ${allVideos.length} vídeos em ${batchNum - 1} batches (parou: ${motivo})`);

  if (DEBUG) {
    console.log('\n── Todos os títulos encontrados ──');
    allVideos.forEach((v, i) => console.log(`  [${i + 1}] ${v.title}`));
    console.log('──────────────────────────────────\n');
  }

  // Filtrar highlights Copa 2026
  const highlights: Highlight[] = [];
  for (const v of allVideos) {
    if (!IS_COPA.test(v.title)) continue;

    const match = v.title.match(HIGHLIGHT_REGEX);
    if (!match) {
      if (DEBUG) console.log(`  ℹ️ Copa sem match de times: "${v.title}"`);
      continue;
    }

    highlights.push({
      title: v.title,
      url: `https://www.youtube.com/watch?v=${v.videoId}`,
      team1: match[1].trim(),
      team2: match[2].trim(),
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

      const normal = nomesCoincide(h.team1, mandante) && nomesCoincide(h.team2, visitante);
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
