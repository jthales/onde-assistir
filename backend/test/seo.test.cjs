const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('cheerio');
const backend = require('../src/jogo-slug.ts');
const frontend = require('../../frontend/src/app/jogo-url.ts');
const { buildSitemapXml, dataBrt } = require('../src/sitemap.ts');

const jogo = {
  timeMandante: 'São Paulo', timeVisitante: 'Atlético-MG', data: '2026-10-15', campeonato: 'Brasileirão',
};
const origem = 'https://ondeassistir.space';
const instante = new Date('2026-10-16T02:59:59Z'); // Ainda 15/10 em Brasília.

function entradas(xml) {
  const $ = load(xml, { xmlMode: true });
  assert.equal($('urlset').attr('xmlns'), 'http://www.sitemaps.org/schemas/sitemap/0.9');
  return $('url').toArray().map(el => ({
    loc: $(el).find('loc').text(), lastmod: $(el).find('lastmod').text(),
    changefreq: $(el).find('changefreq').text(), priority: $(el).find('priority').text(),
  }));
}

for (const [mandante, visitante, esperado] of [
  ['São Paulo', 'Atlético-MG', 'sao-paulo-x-atletico-mg-2026-10-15'],
  ['Caxias', 'XV de Piracicaba', 'caxias-x-xv-de-piracicaba-2026-10-15'],
  ['Xerez', 'Ajax', 'xerez-x-ajax-2026-10-15'],
]) {
  test(`slug em paridade com o frontend: ${mandante} x ${visitante}`, () => {
    const partida = { ...jogo, timeMandante: mandante, timeVisitante: visitante };
    assert.equal(backend.buildJogoSlug(partida), esperado);
    assert.equal(backend.buildJogoSlug(partida), frontend.buildJogoSlug(partida));
    assert.equal(backend.buildJogoUrl(partida), frontend.buildJogoUrl(partida));
  });
}

test('colisão: todos recebem campeonato, sem depender da ordem e em paridade com o frontend', () => {
  const jogos = [jogo, { ...jogo, campeonato: 'Libertadores' }];
  for (const partida of jogos) {
    const slug = backend.buildJogoSlug(partida, jogos);
    assert.equal(slug, frontend.buildJogoSlug(partida, jogos));
    assert.equal(slug, backend.buildJogoSlug(partida, [...jogos].reverse()));
    assert.ok(slug.endsWith('-' + backend.slugify(partida.campeonato)));
  }
  assert.equal(new Set(jogos.map(partida => backend.buildJogoSlug(partida, jogos))).size, 2);
});

test('preserva slug de partida sem colisão e de documentos duplicados', () => {
  assert.equal(backend.buildJogoSlug(jogo, [jogo, { ...jogo }, { ...jogo, data: '2026-10-16' }]),
    'sao-paulo-x-atletico-mg-2026-10-15');
});

test('campeonatos com mesma normalização ou sem nome continuam únicos e em paridade', () => {
  const jogos = ['Série A', 'Serie A', '', 'Sem Campeonato'].map(campeonato => ({ ...jogo, campeonato }));
  const slugs = jogos.map(partida => backend.buildJogoSlug(partida, jogos));
  assert.equal(new Set(slugs).size, jogos.length);
  for (const [idx, partida] of jogos.entries()) {
    assert.equal(slugs[idx], frontend.buildJogoSlug(partida, jogos));
    assert.equal(slugs[idx], backend.buildJogoSlug(partida, [...jogos].reverse()));
  }
});

test('slug legado resolve para o primeiro e slug desambiguado resolve para o campeonato correto', () => {
  const jogos = [jogo, { ...jogo, campeonato: 'Libertadores' }];
  assert.equal(backend.findJogoBySlug(backend.buildJogoSlug(jogo), jogos), jogo);
  assert.equal(frontend.findJogoBySlug(frontend.buildJogoSlug(jogo), jogos), jogo);
  assert.equal(backend.findJogoBySlug(backend.buildJogoSlug(jogos[1], jogos), jogos), jogos[1]);
});

test('data BRT na virada UTC e na meia-noite de Brasília', () => {
  assert.equal(dataBrt(instante), '2026-10-15');
  assert.equal(dataBrt(new Date('2026-10-16T03:00:00Z')), '2026-10-16');
});

test('sitemap mantém home, campeonatos e times históricos e só inclui partidas de hoje em diante', () => {
  const passados = { ...jogo, timeMandante: 'Grêmio', data: '2026-10-14' };
  const futuro = { ...jogo, data: '2026-10-16' };
  const lista = entradas(buildSitemapXml([passados, jogo, futuro], origem, instante));
  const urls = lista.map(item => item.loc);
  assert.ok(urls.includes(origem + '/'));
  for (const campeonato of ['brasileirao', 'libertadores', 'sul-americana']) {
    assert.ok(urls.includes(origem + '/campeonato/' + campeonato));
  }
  assert.ok(urls.includes(origem + '/gremio'));
  const partidas = lista.filter(item => item.loc.includes('/jogo/'));
  assert.equal(partidas.length, 2);
  for (const item of partidas) {
    assert.equal(item.lastmod, '2026-10-15');
    assert.equal(item.changefreq, 'daily');
    assert.equal(item.priority, '0.7');
  }
  assert.ok(!urls.some(url => url.includes('/jogo/') && url.includes('2026-10-14')));
});

test('sitemap exclui o dia anterior depois da meia-noite de Brasília', () => {
  const lista = entradas(buildSitemapXml([jogo, { ...jogo, data: '2026-10-16' }], origem,
    new Date('2026-10-16T03:00:00Z')));
  assert.equal(lista.filter(item => item.loc.includes('/jogo/')).length, 1);
  assert.ok(lista.find(item => item.loc.endsWith('2026-10-16')));
});

test('sitemap deduplica e usa exatamente os permalinks de colisão do frontend', () => {
  const jogos = [jogo, { ...jogo }, { ...jogo, campeonato: 'Libertadores' }];
  const lista = entradas(buildSitemapXml(jogos, origem, instante));
  assert.equal(new Set(lista.map(item => item.loc)).size, lista.length);
  const partidas = lista.filter(item => item.loc.includes('/jogo/')).map(item => item.loc);
  assert.deepEqual(partidas, [...new Set(jogos.map(partida => origem + frontend.buildJogoUrl(partida, jogos)))].sort());
  assert.equal(partidas.length, 2);
});

test('sitemap vazio preserva URLs estáticas e escapa conteúdo XML', () => {
  const lista = entradas(buildSitemapXml([], origem, instante));
  assert.equal(lista.length, 4);
  const xml = buildSitemapXml([jogo], 'https://example.test/a&b/', instante);
  assert.ok(xml.includes('a&amp;b/'));
  assert.equal(entradas(xml)[0].loc, 'https://example.test/a&b/');
});
