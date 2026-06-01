/**
 * Populate Copa do Mundo 2026: busca fixtures da ESPN e salva no Firestore.
 * Canal/streaming ficam vazios nesta fase — broadcast será integrado via FutebolExpert posteriormente.
 *
 * Uso normal:  npx ts-node src/populate-copa-2026.ts
 * Dry-run:     npx ts-node src/populate-copa-2026.ts --dry-run
 */
import 'dotenv/config';
import * as fs from 'fs';
import { db } from './firebase';
import { espnScoreboardUrlForLeague } from './constants';
import { Jogo } from './types';
import { translateCountry } from './country-names';

const DRY_RUN = process.argv.includes('--dry-run');
const ESPN_COPA = 'fifa.world';
const CAMPEONATO_LABEL = 'Copa do Mundo 2026';
const JANELA_DIAS = 60;

function slugify(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function jogoId(data: string, mandante: string, visitante: string): string {
  return `copa26-${data}-${slugify(mandante)}-${slugify(visitante)}`;
}

async function fetchCopaFixtures(): Promise<Array<Omit<Jogo, 'rodada'> & { rodada: number }>> {
  const url = espnScoreboardUrlForLeague(ESPN_COPA, JANELA_DIAS) + '&limit=100';
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`ESPN API error: ${resp.status}`);
  const data: any = await resp.json();

  const fixtures: Array<Omit<Jogo, 'rodada'> & { rodada: number }> = [];

  for (const event of data.events ?? []) {
    const comp = event.competitions?.[0];
    if (!comp) continue;

    const mand = comp.competitors?.find((c: any) => c.homeAway === 'home');
    const visit = comp.competitors?.find((c: any) => c.homeAway === 'away');
    if (!mand || !visit) continue;

    // Ignora jogos já encerrados
    const statusState: string = event.status?.type?.state ?? 'pre';
    const statusCompleted: boolean = event.status?.type?.completed === true;
    if (statusCompleted || statusState === 'post') continue;

    const brt = new Date(new Date(event.date).getTime() - 3 * 60 * 60 * 1000);

    fixtures.push({
      rodada:        0,
      timeMandante:  translateCountry(mand.team.displayName),
      timeVisitante: translateCountry(visit.team.displayName),
      logoMandante:  mand.team.logo ?? '',
      logoVisitante: visit.team.logo ?? '',
      data:          brt.toISOString().slice(0, 10),
      hora:          brt.toISOString().slice(11, 16),
      canal:         [],
      streaming:     ['CazéTV'],
      estadio:       comp.venue?.fullName ?? '',
      campeonato:    CAMPEONATO_LABEL,
    });
  }

  return fixtures;
}

async function runPopulate(): Promise<void> {
  console.log(`\n── Populate Copa do Mundo 2026${DRY_RUN ? ' (DRY-RUN)' : ''} ──\n`);

  const fixtures = await fetchCopaFixtures();
  console.log(`  Jogos encontrados (ESPN): ${fixtures.length}`);

  if (fixtures.length === 0) {
    console.log('  Nenhum jogo futuro encontrado — nada a salvar.');
    return;
  }

  const jogosParaSalvar = fixtures.map(f => ({
    id: jogoId(f.data, f.timeMandante, f.timeVisitante),
    ...f,
    lastUpdated: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  }));

  if (DRY_RUN) {
    const outPath = 'populate-copa-dry-run.json';
    fs.writeFileSync(outPath, JSON.stringify(jogosParaSalvar, null, 2), 'utf-8');
    console.log(`\n📄 Dry-run: ${jogosParaSalvar.length} jogo(s) escritos em ${outPath}`);
    for (const j of jogosParaSalvar) {
      console.log(`   ${j.data} ${j.hora} — ${j.timeMandante} x ${j.timeVisitante} (${j.estadio})`);
    }
  } else {
    const batch = db.batch();
    for (const jogo of jogosParaSalvar) {
      const { id, ...jogoSemId } = jogo;
      batch.set(db.collection('jogos').doc(id), jogoSemId, { merge: true });
    }
    await batch.commit();
    console.log(`\n✅ ${jogosParaSalvar.length} jogo(s) salvos no Firestore (coleção 'jogos')`);
    for (const j of jogosParaSalvar) {
      console.log(`   ${j.data} ${j.hora} — ${j.timeMandante} x ${j.timeVisitante}`);
    }
  }
}

runPopulate()
  .then(() => { process.exitCode = 0; })
  .catch((err) => {
    console.error('Erro no populate-copa-2026:', err);
    process.exitCode = 1;
  });
