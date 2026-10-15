import { buildJogoSlug, buildJogoUrl, findJogoBySlug, JogoSlug } from './jogo-url';

describe('Slugs de partidas', () => {
  const jogo: JogoSlug = {
    timeMandante: 'São Paulo', timeVisitante: 'Atlético-MG', data: '2026-10-20', campeonato: 'Brasileirão',
  };

  it('mantém o permalink existente sem colisão, mesmo com duplicatas ou outras datas', () => {
    expect(buildJogoSlug(jogo, [jogo, { ...jogo }, { ...jogo, data: '2026-10-21' }]))
      .toBe('sao-paulo-x-atletico-mg-2026-10-20');
  });

  it('desambigua todos os campeonatos colidentes independentemente da ordem', () => {
    const jogos = [jogo, { ...jogo, campeonato: 'Libertadores' }];
    expect(buildJogoSlug(jogos[0], jogos)).toBe('sao-paulo-x-atletico-mg-2026-10-20-brasileirao');
    expect(buildJogoSlug(jogos[1], jogos)).toBe('sao-paulo-x-atletico-mg-2026-10-20-libertadores');
    expect(buildJogoSlug(jogos[1], [...jogos].reverse())).toBe(buildJogoSlug(jogos[1], jogos));
  });

  it('resolve o slug desambiguado e mantém o slug legado apontando para o primeiro', () => {
    const jogos = [jogo, { ...jogo, campeonato: 'Libertadores' }];
    expect(findJogoBySlug(buildJogoSlug(jogos[1], jogos), jogos)).toBe(jogos[1]);
    expect(findJogoBySlug(buildJogoSlug(jogo), jogos)).toBe(jogos[0]);
    expect(findJogoBySlug('inexistente', jogos)).toBeUndefined();
  });

  it('preserva nomes com x/hífens e evita colisão de campeonatos com mesma normalização', () => {
    const base = { ...jogo, timeMandante: 'Caxias', timeVisitante: 'XV de Piracicaba' };
    expect(buildJogoSlug(base)).toBe('caxias-x-xv-de-piracicaba-2026-10-20');
    const jogos = ['Série A', 'Serie A', '', 'Sem Campeonato'].map(campeonato => ({ ...base, campeonato }));
    expect(new Set(jogos.map(partida => buildJogoUrl(partida, jogos))).size).toBe(4);
  });
});
