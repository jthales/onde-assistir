import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Jogo } from './types';

const app = express();
const PORT = process.env['PORT'] ?? 3000;

app.use(cors({ origin: 'http://localhost:4200' }));
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env['GEMINI_API_KEY'] ?? '');

app.get('/api/jogos', async (_req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

    const prompt = `Hoje é ${today}. Liste todos os jogos do Brasileirão Série A dos próximos 7 dias.
Retorne APENAS um array JSON puro (sem markdown, sem código, sem explicações) com objetos no seguinte formato:
[
  {
    "rodada": <número da rodada>,
    "timeMandante": "<nome do time mandante>",
    "timeVisitante": "<nome do time visitante>",
    "data": "<data em ISO 8601, ex: 2025-03-22>",
    "hora": "<hora no formato HH:MM>",
    "canal": ["<canal de TV aberta, ex: Globo, Band>"],
    "streaming": ["<plataforma de streaming, ex: Globoplay, Cazé TV>"],
    "estadio": "<nome do estádio>"
  }
]
Se não houver jogos nos próximos 7 dias, retorne um array vazio [].
Retorne SOMENTE o JSON, sem nenhum texto adicional.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Strip markdown code blocks if present
    const jsonText = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const jogos: Jogo[] = JSON.parse(jsonText);

    res.json(jogos);
  } catch (error) {
    console.error('Error fetching jogos:', error);
    res.status(500).json({ error: 'Falha ao buscar jogos da semana' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
