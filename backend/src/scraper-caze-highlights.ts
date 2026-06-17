/**
 * Scraper do canal CazéTV no YouTube para obter links dos melhores momentos dos jogos da Copa 2026.
 * O canal publica vídeos com títulos como:
 *   "MELHORES MOMENTOS: ÁUSTRIA 3 X 1 JORDÂNIA | COPA DO MUNDO FIFA™ 2026 | ..."
 * O scraper faz scroll incremental para contornar o infinite scroll do YouTube.
 * Uso: npx ts-node src/scraper-caze-highlights.ts
 */
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { getDb } from './mongodb';

const CAZE_VIDEOS_URL = 'https://www.youtube.com/@CazeTV/videos';

// Captura: "MELHORES MOMENTOS: TIME1 N X N TIME2 | ... COPA DO MUNDO ..."
const HIGHLIGHT_REGEX =
  /MELHORES MOMENTOS:\s*(.+?)\s+\d+\s*[Xx]\s*\d+\s+(.+?)\s*\|.*COPA DO MUNDO/i;

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function nomesCoincide(extraido: string, dbName: string): boolean {
  const n1 = normalizar(extraido);
  const n2 = normalizar(dbName);
  return n1 === n2 || n1.includes(n2) || n2.includes(n1);
}

interface Highlight {
  title: string;
  url: string;
  team1: string;
  team2: string;
}

async function scrapeYouTubeHighlights(): Promise<Highlight[]> {
  console.log(`Abrindo ${CAZE_VIDEOS_URL}...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 900 });

    await page.goto(CAZE_VIDEOS_URL, { waitUntil: 'networkidle2', timeout: 60_000 });

    // Aguarda carregamento inicial dos vídeos
    await page.waitForSelector('ytd-rich-item-renderer', { timeout: 30_000 });

    const highlights: Map<string, Highlight> = new Map();
    let consecutiveNoNew = 0;
    const MAX_SCROLLS = 15;
    const STOP_AFTER_NO_NEW = 2;

    for (let i = 0; i < MAX_SCROLLS; i++) {
      const videos: Array<{ title: string; href: string }> = await page.evaluate(() => {
        const items = document.querySelectorAll('ytd-rich-item-renderer');
        return Array.from(items).map(item => {
          const titleEl = item.querySelector('#video-title');
          const linkEl = item.querySelector('a#video-title-link');
          return {
            title: titleEl?.textContent?.trim() ?? '',
            href: linkEl?.getAttribute('href') ?? '',
          };
        });
      });

      let novosNestaRodada = 0;
      for (const video of videos) {
        const match = video.title.match(HIGHLIGHT_REGEX);
        if (!match || !video.href) continue;

        const url = `https://www.youtube.com${video.href}`;
        if (highlights.has(url)) continue;

        highlights.set(url, {
          title: video.title,
          url,
          team1: match[1].trim(),
          team2: match[2].trim(),
        });
        novosNestaRodada++;
        console.log(`  Highlight encontrado: ${video.title}`);
      }

      console.log(`Scroll ${i + 1}/${MAX_SCROLLS} — ${novosNestaRodada} novos highlights Copa`);

      if (novosNestaRodada === 0) {
        consecutiveNoNew++;
        if (consecutiveNoNew >= STOP_AFTER_NO_NEW) {
          console.log('Nenhum highlight novo nos últimos scrolls. Encerrando scroll.');
          break;
        }
      } else {
        consecutiveNoNew = 0;
      }

      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 3));
      await new Promise(r => setTimeout(r, 2_000));
    }

    return Array.from(highlights.values());
  } finally {
    await browser.close();
  }
}

async function salvarHighlights(highlights: Highlight[]): Promise<void> {
  if (highlights.length === 0) {
    console.log('Nenhum highlight Copa encontrado.');
    return;
  }

  const db = await getDb();
  const jogosCol = db.collection('jogos');

  const jogos = await jogosCol
    .find({ campeonato: 'Copa do Mundo 2026' })
    .toArray();

  console.log(`\nCruzando ${highlights.length} highlights com ${jogos.length} jogos Copa 2026...`);

  let atualizados = 0;
  let semMatch = 0;

  for (const h of highlights) {
    let matched = false;

    for (const jogo of jogos) {
      const mandante = jogo['timeMandante'] as string;
      const visitante = jogo['timeVisitante'] as string;

      const casaNormal = nomesCoincide(h.team1, mandante) && nomesCoincide(h.team2, visitante);
      const foraInvertido = nomesCoincide(h.team1, visitante) && nomesCoincide(h.team2, mandante);

      if (casaNormal || foraInvertido) {
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
      console.log(`⚠️  Sem match: "${h.team1}" × "${h.team2}" (${h.title})`);
      semMatch++;
    }
  }

  console.log(`\nResumo: ${atualizados} atualizados, ${semMatch} sem match.`);
}

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
    if (resp.ok) {
      console.log('Cache Copa invalidado com sucesso.');
    } else {
      console.warn(`Cache bust retornou ${resp.status}.`);
    }
  } catch (err) {
    console.warn('Falha ao invalidar cache (servidor pode estar offline):', err);
  }
}

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
