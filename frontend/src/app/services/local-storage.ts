/** Leitura defensiva, inclusive quando o acesso ao próprio localStorage lança erro. */
export function lerListaLocal(chave: string): string[] {
  try {
    const valor: unknown = JSON.parse(localStorage.getItem(chave) ?? '[]');
    if (!Array.isArray(valor)) return [];
    return [...new Set(valor.filter((item): item is string => typeof item === 'string' && item.trim().length > 0))];
  } catch {
    return [];
  }
}
