const { test } = require('node:test');
const assert = require('node:assert/strict');
const { montarMataMata, faseAtualSlug, isFaseClassificatoria } = require('../src/mata-mata.ts');

let seq = 0;
function evento({ data, fase, casa, fora, placar, estado = 'post', winner, ano = 2026, series }) {
  const [gc, gf] = placar ?? [null, null];
  return {
    id: String(++seq),
    date: data,
    season: { year: ano, slug: fase },
    status: { type: { state: estado, completed: estado === 'post' } },
    competitions: [{
      venue: { fullName: 'Estádio' },
      series,
      competitors: [
        { id: casa.id, homeAway: 'home', score: gc == null ? undefined : String(gc), winner: winner === casa.id, team: { id: casa.id, displayName: casa.nome, logo: `${casa.id}.png` } },
        { id: fora.id, homeAway: 'away', score: gf == null ? undefined : String(gf), winner: winner === fora.id, team: { id: fora.id, displayName: fora.nome, logo: `${fora.id}.png` } },
      ],
    }],
  };
}

const PAL = { id: '1', nome: 'Palmeiras' };
const FLA = { id: '2', nome: 'Flamengo' };
const RIV = { id: '3', nome: 'River Plate' };
const RAC = { id: '4', nome: 'Racing' };
const AGORA = Date.parse('2026-11-11T16:00:00Z');

const libertadores = [
  evento({ data: '2026-05-20T23:00Z', fase: 'group-stage', casa: PAL, fora: RAC, placar: [2, 0], winner: '1' }),
  evento({ data: '2026-10-21T23:30Z', fase: 'semifinals', casa: RIV, fora: PAL, placar: [1, 1] }),
  evento({ data: '2026-10-28T23:30Z', fase: 'semifinals', casa: PAL, fora: RIV, placar: [2, 0], winner: '1',
    series: { completed: true, competitors: [{ id: '1', winner: true }, { id: '3', winner: false }] } }),
  evento({ data: '2026-10-22T23:30Z', fase: 'semifinals', casa: FLA, fora: RAC, placar: [3, 1] }),
  evento({ data: '2026-10-29T23:30Z', fase: 'semifinals', casa: RAC, fora: FLA, placar: [1, 0], winner: '4' }),
  evento({ data: '2026-11-28T20:00Z', fase: 'final', casa: PAL, fora: FLA, estado: 'pre' }),
];

test('fase atual é a do próximo jogo', () => {
  assert.equal(faseAtualSlug(libertadores, AGORA), 'final');
  assert.equal(isFaseClassificatoria('final'), false);
  assert.equal(isFaseClassificatoria('group-stage'), true);
  assert.equal(isFaseClassificatoria('league-phase'), true);
  assert.equal(isFaseClassificatoria('first-round'), false);
});

test('mata-mata da Libertadores: final (jogo único) primeiro, semifinais depois, sem fase de grupos', () => {
  const r = montarMataMata(libertadores, n => n, AGORA);
  assert.equal(r.tipo, 'mata-mata');
  assert.equal(r.faseAtual, 'Final');
  assert.deepEqual(r.confrontos.map(c => c.fase), ['Final', 'Semifinal', 'Semifinal']);

  const [final, semi1, semi2] = r.confrontos;
  assert.equal(final.jogoUnico, true);
  assert.equal(final.volta, null);
  assert.equal(final.vencedor, null);
  assert.equal(final.time1.nome, 'Palmeiras');

  // River x Palmeiras: 1–1 na ida, Palmeiras 2–0 na volta → agregado River 1 x 3 Palmeiras
  assert.equal(semi1.time1.nome, 'River Plate');
  assert.equal(semi1.agregadoTime1, 1);
  assert.equal(semi1.agregadoTime2, 3);
  assert.equal(semi1.vencedor, 'time2');

  // Flamengo x Racing: 3–1 e 0–1 → agregado 3 x 2, sem `series` na resposta: vencedor pelo agregado
  assert.equal(semi2.agregadoTime1, 3);
  assert.equal(semi2.agregadoTime2, 2);
  assert.equal(semi2.vencedor, 'time1');
});

test('jogo único decidido nos pênaltis usa o vencedor da ESPN', () => {
  const ev = evento({ data: '2026-11-01T20:00Z', fase: 'final', casa: PAL, fora: FLA, placar: [1, 1], winner: '2' });
  ev.competitions[0].competitors[0].shootoutScore = 3;
  ev.competitions[0].competitors[1].shootoutScore = 4;
  const [c] = montarMataMata([ev], n => n, AGORA).confrontos;
  assert.equal(c.vencedor, 'time2');
  assert.equal(c.ida.penaltisMandante, 3);
  assert.equal(c.ida.penaltisVisitante, 4);
});

test('em fase de liga não há confrontos eliminatórios', () => {
  const liga = [evento({ data: '2026-11-25T20:00Z', fase: 'league-phase', casa: PAL, fora: FLA, estado: 'pre' })];
  assert.equal(isFaseClassificatoria(faseAtualSlug(liga, AGORA)), true);
  assert.equal(montarMataMata(liga, n => n, AGORA).confrontos.length, 0);
});
