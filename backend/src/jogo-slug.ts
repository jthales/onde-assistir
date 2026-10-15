// Manter em paridade com frontend/src/app/jogo-url.ts (ver testes do backend).
export interface JogoSlug {
  timeMandante: string;
  timeVisitante: string;
  data: string;
  campeonato?: string;
}

export function slugify(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function baseJogoSlug(jogo: JogoSlug): string {
  return `${slugify(jogo.timeMandante)}-x-${slugify(jogo.timeVisitante)}-${jogo.data}`;
}

export function buildJogoSlug(jogo: JogoSlug, jogos: readonly JogoSlug[] = []): string {
  const base = baseJogoSlug(jogo);
  const campeonato = jogo.campeonato ?? '';
  const campeonatos = new Set(jogos.filter(outro => baseJogoSlug(outro) === base)
    .map(outro => outro.campeonato ?? ''));
  campeonatos.add(campeonato);
  if (campeonatos.size === 1) return base;

  // Todos os colidentes recebem sufixo, independentemente da ordem da lista.
  const sufixo = (nome: string) => slugify(nome) || 'sem-campeonato';
  const slugCampeonato = sufixo(campeonato);
  if ([...campeonatos].filter(nome => sufixo(nome) === slugCampeonato).length === 1) {
    return `${base}-${slugCampeonato}`;
  }
  // Nomes diferentes que normalizam para o mesmo slug também precisam ser únicos.
  const identidade = Array.from(campeonato, letra => letra.codePointAt(0)!.toString(16)).join('-') || 'sem-nome';
  return `${base}-${slugCampeonato}-${identidade}`;
}

export function buildJogoUrl(jogo: JogoSlug, jogos: readonly JogoSlug[] = []): string {
  return `/jogo/${buildJogoSlug(jogo, jogos)}`;
}

export function findJogoBySlug<T extends JogoSlug>(slug: string, jogos: readonly T[]): T | undefined {
  return jogos.find(jogo => buildJogoSlug(jogo, jogos) === slug)
    ?? jogos.find(jogo => baseJogoSlug(jogo) === slug);
}
