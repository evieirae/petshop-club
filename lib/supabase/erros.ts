// Erros do Postgres que viram mensagem amigável na tela.

type ErroPostgrest = { code?: string; message?: string } | null | undefined;

/**
 * Violação do índice único tutores_petshop_telefone_key (migration 0032):
 * já existe outro tutor com o mesmo telefone — comparado só pelos dígitos,
 * então "(48) 99999-0000" e "48999990000" contam como o mesmo.
 */
export function ehTelefoneDuplicado(error: ErroPostgrest): boolean {
  return !!error && error.code === "23505" && (error.message ?? "").includes("tutores_petshop_telefone_key");
}

export const ERRO_TELEFONE_DUPLICADO =
  "Já existe um tutor com esse telefone neste petshop. Procure por ele na lista em vez de cadastrar de novo.";
