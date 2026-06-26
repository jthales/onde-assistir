/**
 * Populate Copa do Mundo 2026: busca fixtures da ESPN e salva no Firestore.
 * Canal/streaming ficam vazios nesta fase — broadcast será integrado via FutebolExpert posteriormente.
 *
 * Uso normal:  npx ts-node src/populate-copa-2026.ts
 * Dry-run:     npx ts-node src/populate-copa-2026.ts --dry-run
 */
import 'dotenv/config';
import * as fs from 'fs';
import { getDb } from './mongodb';
import { espnCopaUrl } from './constants';
import { Jogo } from './types';
import { translateCountry } from './country-names';

const DRY_RUN = process.argv.includes('--dry-run');
const CAMPEONATO_LABEL = 'Copa do Mundo 2026';

function jogoId(espnEventId: string): string {
  return `copa26-espn-${espnEventId}`;
}

async function fetchCopaFixtures(): Promise<Array<Omit<Jogo, 'rodada'> & { rodada: number; espnEventId: string }>> {
  const url = espnCopaUrl();
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`ESPN API error: ${resp.status}`);
  const data: any = await resp.json();

  const fixtures: Array<Omit<Jogo, 'rodada'> & { rodada: number; espnEventId: string }> = [];

  for (const event of data.events ?? []) {
    const comp = event.competitions?.[0];
    if (!comp) continue;

    const mand = comp.competitors?.find((c: any) => c.homeAway === 'home');
    const visit = comp.competitors?.find((c: any) => c.homeAway === 'away');
    if (!mand || !visit) continue;

    const brt = new Date(new Date(event.date).getTime() - 3 * 60 * 60 * 1000);

    fixtures.push({
      rodada:        0,
      espnEventId:   String(event.id),
      timeMandante:  translateCountry(mand.team.displayName),
      timeVisitante: translateCountry(visit.team.displayName),
      logoMandante:  mand.team.logo ?? '',
      logoVisitante: visit.team.logo ?? '',
      data:          brt.toISOString().slice(0, 10),
      hora:          brt.toISOString().slice(11, 16),
      canal:         [],
      streaming:     ['CazéTV', 'Prime Video'],
      estadio:       comp.venue?.fullName ?? '',
      campeonato:    CAMPEONATO_LABEL,
    });
  }

  return fixtures;
}

async function limparCopaJogos(): Promise<void> {
  const mdb = await getDb();
  const result = await mdb.collection('jogos').deleteMany({ campeonato: CAMPEONATO_LABEL });
  if (result.deletedCount === 0) { console.log('  Nenhum documento Copa existente para remover.'); return; }
  console.log(`  🗑  ${result.deletedCount} documento(s) Copa removido(s) do MongoDB.`);
}

async function runPopulate(): Promise<void> {
  console.log(`\n── Populate Copa do Mundo 2026${DRY_RUN ? ' (DRY-RUN)' : ''} ──\n`);

  const fixtures = await fetchCopaFixtures();
  console.log(`  Jogos encontrados (ESPN): ${fixtures.length}`);

  if (fixtures.length === 0) {
    console.log('  Nenhum jogo encontrado — nada a salvar.');
    return;
  }

  // Não apaga jogos existentes — apenas faz upsert para preservar resultados de rodadas passadas
  // e dados de canal/streaming já preenchidos pelo scraper.

  // Pre-fetch existing docs to preserve channel data set by the scraper
  const mdb = await getDb();
  const existingArr = await mdb.collection('jogos').find({ campeonato: CAMPEONATO_LABEL }).toArray();
  const existingDocs = new Map<string, { canal: string[]; streaming: string[] }>();
  for (const doc of existingArr) {
    existingDocs.set(doc['_id'] as unknown as string, { canal: doc['canal'] ?? [], streaming: doc['streaming'] ?? [] });
  }
  console.log(`  Jogos já existentes no MongoDB: ${existingDocs.size}`);

  const jogosParaSalvar = fixtures.map(f => ({
    id: jogoId(f.espnEventId),
    ...f,
    lastUpdated: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  }));

  if (DRY_RUN) {
    const outPath = 'populate-copa-dry-run.json';
    fs.writeFileSync(outPath, JSON.stringify(jogosParaSalvar, null, 2), 'utf-8');
    console.log(`\n📄 Dry-run: ${jogosParaSalvar.length} jogo(s) escritos em ${outPath}`);
    for (const j of jogosParaSalvar) {
      console.log(`   ${j.id} ${j.data} ${j.hora} — ${j.timeMandante} x ${j.timeVisitante} (${j.estadio})`);
    }
  } else {
    const validIds = new Set(jogosParaSalvar.map(j => j.id));

    const bulkOps = jogosParaSalvar.map(jogo => {
      const { id, canal: defaultCanal, streaming: defaultStreaming, ...jogoBase } = jogo;
      const existing = existingDocs.get(id);

      // Preserve scraper-set channels; only use default when:
      // - doc is new (no existing), OR
      // - doc has 0 or 1 streaming item (old default or bad comma-joined format)
      const isOldDefault = existing &&
        existing.canal.length === 0 &&
        existing.streaming.length <= 1;

      const docData: Record<string, unknown> = {
        ...jogoBase,
        canal:     (existing && !isOldDefault) ? existing.canal     : defaultCanal,
        streaming: (existing && !isOldDefault) ? existing.streaming : defaultStreaming,
      };
      return {
        updateOne: {
          filter: { _id: id } as any,
          update: { $set: docData },
          upsert: true,
        },
      };
    });
    await mdb.collection('jogos').bulkWrite(bulkOps);

    // Remove documentos Copa com IDs que não correspondem a nenhum evento ESPN atual.
    // Isso limpa órfãos gerados antes desta correção (IDs baseados em nomes de times).
    const deleteResult = await mdb.collection('jogos').deleteMany({
      campeonato: CAMPEONATO_LABEL,
      _id: { $nin: Array.from(validIds) } as any,
    });
    if (deleteResult.deletedCount > 0) {
      console.log(`  🗑  ${deleteResult.deletedCount} documento(s) órfão(s) removido(s) do MongoDB.`);
    }

    console.log(`\n✅ ${jogosParaSalvar.length} jogo(s) salvos no MongoDB (coleção 'jogos')`);
    for (const j of jogosParaSalvar) {
      console.log(`   ${j.data} ${j.hora} — ${j.timeMandante} x ${j.timeVisitante}`);
    }
  }
}

runPopulate()
  .then(() => { process.exit(0); })
  .catch((err) => {
    console.error('Erro no populate-copa-2026:', err);
    process.exit(1);
  });
