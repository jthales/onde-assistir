import { Jogo } from './models/jogo';

export function slugify(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export function buildJogoSlug(jogo: Jogo): string {
  return `${slugify(jogo.timeMandante)}-x-${slugify(jogo.timeVisitante)}-${jogo.data}`;
}

export function buildJogoUrl(jogo: Jogo): string {
  return `/jogo/${buildJogoSlug(jogo)}`;
}
