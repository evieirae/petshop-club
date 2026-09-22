// ============================================================================
// Normalização compartilhada da importação por planilha.
//
// normalizarTelefone e normalizarNome são ESPELHOS das funções SQL de mesmo
// nome em supabase/migrations/0032_importacao_planilha.sql — a conferência
// (aqui, em TypeScript) e o aplicar (lá, em SQL) precisam chegar à mesma
// chave, senão uma linha que a tela mostrou como "nova" vira duplicada no
// banco (ou o contrário). Mudou aqui, muda lá.
// ============================================================================

/**
 * Só dígitos, sem zero de discagem à esquerda, sem o +55.
 * DDD 55 (RS) não é confundido com o código do país: número nacional tem 10
 * ou 11 dígitos, então só 12/13 dígitos começando com 55 perdem o prefixo.
 */
export function normalizarTelefone(valor: string | null | undefined): string {
  const digitos = (valor ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) {
    return digitos.slice(2);
  }
  return digitos;
}

/** Telefone brasileiro plausível: DDD + 8 (fixo) ou 9 (celular) dígitos. */
export function telefoneValido(normalizado: string): boolean {
  return normalizado.length === 10 || normalizado.length === 11;
}

const COM_ACENTO = "áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ";
const SEM_ACENTO = "aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN";
const MAPA_ACENTOS: Record<string, string> = Object.fromEntries(
  [...COM_ACENTO].map((c, i) => [c, SEM_ACENTO[i]])
);

/** Minúsculo, sem acento, espaços colapsados — chave de comparação de nomes. */
export function normalizarNome(valor: string | null | undefined): string {
  return [...(valor ?? "").replace(/\s+/g, " ").trim()]
    .map((c) => MAPA_ACENTOS[c] ?? c)
    .join("")
    .toLowerCase();
}

/** Texto de célula limpo: sem espaços sobrando; vazio vira null. */
export function textoLimpo(valor: string | null | undefined, max = 500): string | null {
  const limpo = (valor ?? "").replace(/\s+/g, " ").trim();
  if (!limpo) return null;
  return limpo.slice(0, max);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizarEmail(valor: string | null | undefined): string | null {
  const limpo = (valor ?? "").trim().toLowerCase();
  return limpo && EMAIL_RE.test(limpo) ? limpo : null;
}

/** CPF só com dígitos; null se não tiver 11 dígitos (não confere o DV). */
export function normalizarCpf(valor: string | null | undefined): string | null {
  const digitos = (valor ?? "").replace(/\D/g, "");
  return digitos.length === 11 ? digitos : null;
}

/** Exibição: (48) 99999-0000 / (48) 3333-0000. Qualquer outra coisa volta como veio. */
export function formatarTelefone(valor: string | null | undefined): string {
  const d = normalizarTelefone(valor);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return (valor ?? "").trim();
}
