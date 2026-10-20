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

test('sitemap mantém home, campeonatos e só inclui partidas de hoje em diante, com lastmod real', () => {
  const passados = { ...jogo, timeMandante: 'Grêmio', data: '2026-10-14' };
  const futuro = { ...jogo, data: '2026-10-16', lastUpdated: '2026-10-15T12:00:00.000Z' };
  const lista = entradas(buildSitemapXml([passados, jogo, futuro], origem, instante));
  const urls = lista.map(item => item.loc);
  assert.ok(urls.includes(origem + '/'));
  for (const campeonato of ['brasileirao', 'libertadores', 'sul-americana', 'champions-league', 'copa-do-brasil']) {
    assert.ok(urls.includes(origem + '/campeonato/' + campeonato), campeonato);
  }
  for (const rota of ['/copa-2026', '/ao-vivo']) assert.ok(urls.includes(origem + rota), rota);
  const partidas = lista.filter(item => item.loc.includes('/jogo/'));
  assert.equal(partidas.length, 2);
  for (const item of partidas) {
    assert.equal(item.changefreq, 'daily');
    assert.equal(item.priority, '0.7');
  }
  // lastmod só quando o documento tem lastUpdated; nunca "hoje" por padrão.
  assert.equal(partidas.find(item => item.loc.endsWith('2026-10-16')).lastmod, '2026-10-15');
  assert.equal(partidas.find(item => item.loc.endsWith('2026-10-15')).lastmod, '');
  assert.ok(!urls.some(url => url.includes('/jogo/') && url.includes('2026-10-14')));
});

test('sitemap só lista páginas de time que a SPA resolve e não usa lastmod nas páginas fixas', () => {
  const jogos = [{ ...jogo, timeMandante: 'Alemanha', timeVisitante: 'Boca Juniors' }];
  const comLista = entradas(buildSitemapXml(jogos, origem, instante, { timesComPagina: ['flamengo', 'coritiba', 'flamengo'] }));
  const times = comLista.filter(item => item.priority === '0.8' && !item.loc.endsWith('/ao-vivo')).map(item => item.loc);
  assert.deepEqual(times, [origem + '/coritiba', origem + '/flamengo']);
  assert.ok(!comLista.some(item => item.loc.endsWith('/alemanha') || item.loc.endsWith('/boca-juniors')));
  for (const item of comLista.filter(i => !i.loc.includes('/jogo/'))) assert.equal(item.lastmod, '', item.loc);
  // Fallback estático: chaves de TEAM_ESPN_ID_MAP.
  const { TEAM_ESPN_ID_MAP } = require('../src/constants.ts');
  const padrao = entradas(buildSitemapXml([], origem, instante)).filter(i => i.priority === '0.8' && !i.loc.endsWith('/ao-vivo'));
  assert.equal(padrao.length, Object.keys(TEAM_ESPN_ID_MAP).length);
});

test('lista de campeonatos do sitemap está em paridade com o frontend (CAMP_SLUG_LABEL)', () => {
  const { CAMPEONATOS_SITEMAP } = require('../src/sitemap.ts');
  const fonte = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../frontend/src/app/app.ts'), 'utf8');
  const bloco = fonte.match(/CAMP_SLUG_LABEL[^{]*\{([\s\S]*?)\};/)[1];
  const slugsFrontend = [...bloco.matchAll(/'([a-z0-9-]+)':/g)].map(m => m[1]).sort();
  assert.deepEqual([...CAMPEONATOS_SITEMAP].sort(), slugsFrontend);
});

test('Champions League mapeia slug, id ESPN e rótulo nas constantes do backend', () => {
  const { ESPN_LEAGUES, LIGA_SLUG_TO_ESPN, LIGA_SLUG_LABEL } = require('../src/constants.ts');
  assert.equal(ESPN_LEAGUES.championsleague, 'uefa.champions');
  assert.equal(LIGA_SLUG_TO_ESPN['champions-league'], 'uefa.champions');
  assert.equal(LIGA_SLUG_LABEL['champions-league'], 'UEFA Champions League');
});

test('Gemini nunca é fonte para a Champions League (QA-04)', () => {
  const { geminiPermitido, filtrarRespostaGemini, transmissaoPermitida } = require('../src/broadcast-guard.ts');
  assert.equal(geminiPermitido('Champions League'), false);
  assert.equal(geminiPermitido('Brasileirão'), true);
  assert.equal(geminiPermitido('Libertadores'), true);
  const ucl = { timeMandante: 'Liverpool', timeVisitante: 'Villarreal', campeonato: 'Champions League' };
  const bra = { timeMandante: 'Flamengo', timeVisitante: 'Santos', campeonato: 'Brasileirão' };
  const globo = { canal: ['Globo'], streaming: ['Globoplay'] };
  const paraGemini = [bra]; // a Champions nunca é enviada
  // Gemini devolve o jogo pedido E uma entrada extra da Champions que ninguém pediu.
  const resposta = new Map([['Flamengo|Santos', globo], ['Liverpool|Villarreal', globo], ['Outro|Time', globo]]);
  const limpo = filtrarRespostaGemini(paraGemini, resposta);
  assert.deepEqual([...limpo.keys()], ['Flamengo|Santos']);
  // Consumo final: Champions nunca recebe canal/streaming vindos do Gemini, outros campeonatos ficam iguais.
  assert.deepEqual(transmissaoPermitida(ucl.campeonato, 'gemini', globo), { canal: [], streaming: [] });
  assert.deepEqual(transmissaoPermitida(ucl.campeonato, undefined, globo), { canal: [], streaming: [] });
  assert.equal(transmissaoPermitida(ucl.campeonato, 'futebolexpert', globo), globo);
  assert.equal(transmissaoPermitida(bra.campeonato, 'gemini', globo), globo);
  assert.equal(transmissaoPermitida(bra.campeonato, 'gemini', limpo.get('Flamengo|Santos')), globo);
  assert.equal(transmissaoPermitida(bra.campeonato, undefined, undefined), undefined);
  // Mesmo se a entrada extra sobrevivesse no mapa, o consumo a anula.
  assert.deepEqual(transmissaoPermitida(ucl.campeonato, undefined, resposta.get('Liverpool|Villarreal')), { canal: [], streaming: [] });
});

test('Champions é reconhecida por aliases e demais campeonatos não mudam (R3-01)', () => {
  const { geminiPermitido, filtrarRespostaGemini, transmissaoPermitida } = require('../src/broadcast-guard.ts');
  const globo = { canal: ['Globo'], streaming: ['Globoplay'] };
  const vazio = { canal: [], streaming: [] };
  for (const alias of ['UEFA Champions League', 'CHAMPIONS LEAGUE', 'Champions League ', '  uefa   champions  league']) {
    assert.equal(geminiPermitido(alias), false, alias);
    assert.deepEqual(transmissaoPermitida(alias, 'gemini', globo), vazio, alias);
    assert.deepEqual(transmissaoPermitida(alias, undefined, globo), vazio, alias);
    for (const fonte of ['futebolexpert', 'rodada', 'scrape']) {
      assert.equal(transmissaoPermitida(alias, fonte, globo), globo, alias + ' ' + fonte);
    }
    const enviados = [{ timeMandante: 'A', timeVisitante: 'B', campeonato: alias }];
    assert.equal(filtrarRespostaGemini(enviados, new Map([['A|B', globo]])).size, 0, alias);
  }
  for (const outro of ['Brasileirão', 'Libertadores', 'Sul-Americana', 'Copa do Brasil']) {
    assert.equal(geminiPermitido(outro), true, outro);
    assert.equal(transmissaoPermitida(outro, 'gemini', globo), globo, outro);
  }
});

test('sitemap exclui o dia anterior depois da meia-noite de Brasília', () => {
  const lista = entradas(buildSitemapXml([jogo, { ...jogo, data: '2026-10-16' }], origem,
    new Date('2026-10-16T03:00:00Z')));
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
  const { CAMPEONATOS_SITEMAP } = require('../src/sitemap.ts');
  const { TEAM_ESPN_ID_MAP } = require('../src/constants.ts');
  assert.equal(lista.length, 1 + CAMPEONATOS_SITEMAP.length + 2 + Object.keys(TEAM_ESPN_ID_MAP).length);
  const xml = buildSitemapXml([jogo], 'https://example.test/a&b/', instante);
  assert.ok(xml.includes('a&amp;b/'));
  assert.equal(entradas(xml)[0].loc, 'https://example.test/a&b/');
});

test('sitemap ignora documentos incompletos e não deriva páginas de time dos jogos', () => {
  const incompletos = [
    { ...jogo, timeMandante: '', timeVisitante: 'Sem Mandante' },
    { ...jogo, timeMandante: 'Sem Visitante', timeVisitante: '' },
    { ...jogo, timeMandante: '  ', timeVisitante: 'Outro Incompleto' },
    { ...jogo, timeMandante: 'Incompleto Também', timeVisitante: '\t' },
  ];
  const historicos = [{ ...jogo, data: '2026-01-01', timeMandante: 'Grêmio', timeVisitante: 'São Paulo' }];
  const lista = entradas(buildSitemapXml([...incompletos, ...historicos, jogo], origem, instante, { timesComPagina: ['gremio', 'sao-paulo'] }));
  const urls = lista.map(item => item.loc);
  for (const slug of ['gremio', 'sao-paulo']) assert.ok(urls.includes(origem + '/' + slug));
  for (const slug of ['sem-mandante', 'sem-visitante', 'atletico-mg']) assert.ok(!urls.includes(origem + '/' + slug), slug);
});

test('cache imutável só para arquivos com hash do build (B5)', () => {
  const { join } = require('node:path');
  const vercel = JSON.parse(require('node:fs').readFileSync(join(__dirname, '../../frontend/vercel.json'), 'utf8'));
  const regra = vercel.headers.find(h => h.headers.some(c => c.value === 'public, max-age=31536000, immutable'));
  const re = new RegExp('^' + regra.source + '$');
  for (const arquivo of ['main-XZ5JGCIJ.js', 'chunk-AB12CD34.js', 'polyfills-ABCDEFGH.js', 'styles-TKKZADJH.css']) {
    assert.ok(re.test('/' + arquivo), arquivo);
  }
  for (const arquivo of ['index.html', 'ngsw.json', 'ngsw-worker.js', 'safety-worker.js', 'worker-basic.min.js', 'ads.txt',
    'robots.txt', 'sitemap.xml', 'favicon/manifest.json', 'favicon/android-icon-192x192.png', 'google2731f870aa0f9d17.html', 'main.js']) {
    assert.ok(!re.test('/' + arquivo), arquivo);
  }
  // Nomes reais do último build, quando existir.
  const dist = join(__dirname, '../../frontend/dist/frontend/browser');
  if (require('node:fs').existsSync(dist)) {
    for (const f of require('node:fs').readdirSync(dist)) {
      assert.equal(re.test('/' + f), /^(main|polyfills|chunk|styles|scripts)-[A-Z0-9]{8}.(js|css)$/.test(f), f);
    }
  }
});
