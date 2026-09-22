import { normalizarNome } from "./normalizar";

// ============================================================================
// Campos de uma importação e o palpite automático de mapeamento.
//
// O petshop sobe o export da ferramenta antiga do jeito que ela gera — a
// coluna do tutor pode se chamar "Cliente", "Responsável", "Nome do Tutor"…
// O palpite casa cabeçalho com campo por sinônimo; a tela deixa corrigir
// antes de conferir. Sem isso o petshop teria de reformatar a planilha, e a
// fricção que a importação existe para tirar voltaria.
// ============================================================================

export type EntidadeImportacao = "tutores_pets";

export type CampoImportacao = {
  chave: string;
  rotulo: string; // também é o cabeçalho do modelo .xlsx — casa 100% no palpite
  obrigatorio: boolean;
  dica?: string;
  sinonimos: string[];
  exemplos: string[]; // uma entrada por linha de exemplo do modelo
};

/** chave do campo → cabeçalho da planilha (null = não importar). */
export type Mapeamento = Record<string, string | null>;

function chaveComparacao(texto: string): string {
  return normalizarNome(texto)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pontuar(cabecalho: string, campo: CampoImportacao): number {
  const cab = chaveComparacao(cabecalho);
  if (!cab) return 0;
  const candidatos = [campo.rotulo, ...campo.sinonimos].map(chaveComparacao);

  let melhor = 0;
  for (const sin of candidatos) {
    if (!sin) continue;
    if (cab === sin) return 1;
    // Sinônimo aparece como palavra(s) inteira(s) dentro do cabeçalho:
    // quanto mais do cabeçalho ele cobre, mais forte o palpite.
    if (` ${cab} `.includes(` ${sin} `)) {
      melhor = Math.max(melhor, 0.6 + 0.3 * (sin.length / cab.length));
    }
  }
  return melhor;
}

/**
 * Palpite guloso: pares (cabeçalho, campo) em ordem de pontuação, cada
 * cabeçalho e cada campo usados no máximo uma vez, abaixo de 0.6 não chuta.
 */
export function sugerirMapeamento(cabecalhos: string[], campos: CampoImportacao[]): Mapeamento {
  const pares: { cab: string; chave: string; nota: number }[] = [];
  for (const cab of cabecalhos) {
    for (const campo of campos) {
      const nota = pontuar(cab, campo);
      if (nota >= 0.6) pares.push({ cab, chave: campo.chave, nota });
    }
  }
  pares.sort((a, b) => b.nota - a.nota);

  const mapeamento: Mapeamento = Object.fromEntries(campos.map((c) => [c.chave, null]));
  const usados = new Set<string>();
  for (const { cab, chave } of pares) {
    if (mapeamento[chave] || usados.has(cab)) continue;
    mapeamento[chave] = cab;
    usados.add(cab);
  }
  return mapeamento;
}

/** Confere o mapeamento vindo da tela. Devolve a mensagem de erro, ou null. */
export function validarMapeamento(
  mapeamento: Mapeamento,
  campos: CampoImportacao[],
  cabecalhos: string[]
): string | null {
  const existentes = new Set(cabecalhos);
  const usados = new Map<string, string>();
  for (const campo of campos) {
    const cab = mapeamento[campo.chave];
    if (!cab) {
      if (campo.obrigatorio) return `Escolha qual coluna da planilha é "${campo.rotulo}".`;
      continue;
    }
    if (!existentes.has(cab)) return `A coluna "${cab}" não existe na planilha.`;
    const outro = usados.get(cab);
    if (outro) return `A coluna "${cab}" foi escolhida para "${outro}" e para "${campo.rotulo}".`;
    usados.set(cab, campo.rotulo);
  }
  return null;
}

/** Lê o valor de um campo numa linha, seguindo o mapeamento. */
export function valorCampo(
  valores: Record<string, string>,
  mapeamento: Mapeamento,
  chave: string
): string {
  const cab = mapeamento[chave];
  return cab ? (valores[cab] ?? "").trim() : "";
}
