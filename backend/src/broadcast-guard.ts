/**
 * Competições cujos direitos no Brasil não têm fonte verificável no projeto.
 * Para elas o Gemini nunca é fonte: só scrapers com match confirmado (FutebolExpert / ge.globo)
 * podem preencher canal e streaming; sem confirmação, a transmissão fica vazia.
 */
const SEM_GEMINI = new Set(['champions league']);
const FONTES_VERIFICAVEIS = new Set(['futebolexpert', 'rodada', 'scrape']);

interface FixtureChave {
  timeMandante: string;
  timeVisitante: string;
  campeonato: string;
}

/** Trim, caixa, acentos, espaços duplicados e prefixo "UEFA" removidos antes de comparar. */
function normalizarCampeonato(campeonato: string): string {
  return (campeonato ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim().replace(/^uefa /, '');
}

export function geminiPermitido(campeonato: string): boolean {
  return !SEM_GEMINI.has(normalizarCampeonato(campeonato));
}

/** Allowlist: mantém da resposta do Gemini só as chaves dos jogos efetivamente enviados (e permitidos). */
export function filtrarRespostaGemini<T>(enviados: FixtureChave[], resultado: Map<string, T>): Map<string, T> {
  const permitidas = new Set(enviados.filter(f => geminiPermitido(f.campeonato))
    .map(f => `${f.timeMandante}|${f.timeVisitante}`));
  return new Map([...resultado].filter(([chave]) => permitidas.has(chave)));
}

/** Transmissão final do jogo: competição sem fonte verificável só aceita fontes de scraper confirmadas. */
export function transmissaoPermitida<T extends { canal: string[]; streaming: string[] }>(
  campeonato: string, fonte: string | undefined, broadcast: T | undefined,
): T | { canal: string[]; streaming: string[] } | undefined {
  if (geminiPermitido(campeonato) || (fonte && FONTES_VERIFICAVEIS.has(fonte))) return broadcast;
  return { canal: [], streaming: [] };
}
