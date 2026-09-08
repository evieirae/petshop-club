import { randomBytes } from "crypto";

/**
 * Senha inicial de um tutor recem-liberado, e o prazo dela.
 *
 * Existe um unico interruptor aqui, e ele e uma variavel de ambiente:
 *
 *   TUTOR_SENHA_PADRAO setada  → todo tutor novo nasce com ESSA senha.
 *   TUTOR_SENHA_PADRAO vazia   → cada tutor nasce com uma senha aleatoria,
 *                                que aparece uma vez na tela da administracao
 *                                (mesmo comportamento que o dono do petshop
 *                                ja tem desde a 0017).
 *
 * A senha fixa e a decisao atual (31/ago/2026): mais facil de ditar no
 * balcao e de escrever no WhatsApp. O preco esta escrito por extenso no fim
 * de supabase/migrations/0024_portal_tutor_acesso.sql — resumo: e-mail de
 * tutor nao e segredo, entao quem souber o padrao entra na conta de qualquer
 * tutor que ainda nao trocou a senha. Por isso o acesso e liberado um a um,
 * a senha expira em poucos dias e a troca e obrigatoria no primeiro login.
 *
 * Pra fechar o buraco de vez nao e preciso mexer em codigo nem em banco:
 * basta APAGAR TUTOR_SENHA_PADRAO do ambiente. O caminho aleatorio ja esta
 * pronto abaixo e a tela da administracao ja sabe mostrar a senha gerada.
 */

/** Horas de validade da senha provisoria. Passou disso, o login e recusado. */
export const HORAS_VALIDADE_SENHA_PROVISORIA = 72;

// Alfabeto sem caracteres ambiguos (sem 0/O, 1/l/I) — a senha e lida e
// digitada por uma pessoa, nao colada de um gerenciador de senhas. Mesmo
// alfabeto usado em app/(admin)/admin/actions.ts pro dono do petshop.
const ALFABETO_SENHA = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function gerarSenhaAleatoria(): string {
  const bytes = randomBytes(12);
  let senha = "";
  for (let i = 0; i < bytes.length; i++) {
    senha += ALFABETO_SENHA[bytes[i] % ALFABETO_SENHA.length];
  }
  return senha;
}

export type SenhaInicial = {
  senha: string;
  /** true quando veio da env (a mesma pra todos), false quando foi sorteada. */
  padrao: boolean;
  /** ISO — vai pra tutores.senha_provisoria_expira_em. */
  expiraEm: string;
};

export function senhaInicialTutor(): SenhaInicial {
  const daEnv = process.env.TUTOR_SENHA_PADRAO?.trim();

  // O Supabase Auth recusa senha com menos de 6 caracteres. Uma env mal
  // preenchida nao pode virar "criei o tutor mas o login nao funciona":
  // cai no caminho aleatorio, que sempre funciona.
  const usaPadrao = Boolean(daEnv && daEnv.length >= 6);

  const expira = new Date();
  expira.setHours(expira.getHours() + HORAS_VALIDADE_SENHA_PROVISORIA);

  return {
    senha: usaPadrao ? (daEnv as string) : gerarSenhaAleatoria(),
    padrao: usaPadrao,
    expiraEm: expira.toISOString(),
  };
}

/** Regra de senha nova escolhida pelo tutor. Mensagem ja pronta pra tela. */
export function validarSenhaNova(senha: string): string | null {
  if (senha.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (!/[a-zA-Z]/.test(senha)) return "Use pelo menos uma letra.";
  if (!/[0-9]/.test(senha)) return "Use pelo menos um numero.";
  if (senha.trim() !== senha) return "A senha nao pode comecar nem terminar com espaco.";
  return null;
}
