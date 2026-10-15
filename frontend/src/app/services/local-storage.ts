/** Leitura defensiva, inclusive quando o acesso ao próprio localStorage lança erro. */
export function lerListaLocal(chave: string): string[] {
  try {
    const valor: unknown = JSON.parse(localStorage.getItem(chave) ?? '[]');
    if (!Array.isArray(valor) || !valor.every(item => typeof item === 'string' && item.trim())) return [];
    return [...new Set(valor as string[])];
  } catch {
    return [];
  }
}
