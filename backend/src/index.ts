import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Jogo } from './types';
import { db } from './firebase';
import { espnScoreboardUrl, TEAM_NAME_MAP } from './constants';
const app = express();
const PORT = process.env['PORT'] ?? 3000;

app.use(cors({
  origin: [
    'http://localhost:4200',
    'https://onde-assistir-five.vercel.app',
  ],
}));
app.use(express.json());

app.get('/api/jogos', async (_req, res) => {
  try {
    const snap = await db.collection('jogos').get();

    if (snap.empty) {
      res.json([]);
      return;
    }

    const jogos: Jogo[] = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        rodada: d['rodada'],
        timeMandante: d['timeMandante'],
        timeVisitante: d['timeVisitante'],
        logoMandante: d['logoMandante'] ?? '',
        logoVisitante: d['logoVisitante'] ?? '',
        data: d['data'],
        hora: d['hora'],
        canal: d['canal'] ?? [],
        streaming: d['streaming'] ?? [],
        estadio: d['estadio'] ?? '',
        campeonato: d['campeonato'] ?? '',
      };
    });

    res.json(jogos);
  } catch (error) {
    console.error('Erro ao buscar jogos do Firestore:', error);
    res.status(500).json({ error: 'Falha ao buscar jogos' });
  }
});

// Cache em memória — máx 2 chamadas/min à ESPN
let placarCache: { dados: any[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

app.get('/api/placar', async (_req, res) => {
  const agora = Date.now();

  if (placarCache && agora - placarCache.fetchedAt < CACHE_TTL_MS) {
    res.json(placarCache.dados);
    return;
  }

  try {
    const resp = await fetch(espnScoreboardUrl());
    const data: any = await resp.json();

    const placares = (data.events ?? []).map((event: any) => {
      const comp = event.competitions?.[0];
      const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
      const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');

      const statusName: string = event.status?.type?.name ?? '';
      const status =
        statusName === 'In Progress' ? 'em-andamento' :
        statusName === 'Final'       ? 'encerrado'    : 'agendado';

      const dataJogo = new Date(event.date).toISOString().slice(0, 10);

      return {
        timeMandante:    TEAM_NAME_MAP[home?.team?.displayName] ?? home?.team?.displayName ?? '',
        timeVisitante:   TEAM_NAME_MAP[away?.team?.displayName] ?? away?.team?.displayName ?? '',
        data:            dataJogo,
        placarMandante:  home?.score != null ? Number(home.score) : null,
        placarVisitante: away?.score != null ? Number(away.score) : null,
        status,
        tempo:           event.status?.displayClock ?? undefined,
      };
    });

    placarCache = { dados: placares, fetchedAt: Date.now() };
    res.json(placares);
  } catch (error) {
    console.error('Erro ao buscar placares da ESPN:', error);
    if (placarCache) { res.json(placarCache.dados); return; }
    res.status(500).json({ error: 'Falha ao buscar placares' });
  }
});

if (process.env['NODE_ENV'] !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
