import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Jogo } from './types';
import { db } from './firebase';
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

if (process.env['NODE_ENV'] !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
