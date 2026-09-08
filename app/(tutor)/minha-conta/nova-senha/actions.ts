"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTutorContext } from "@/lib/auth/getTutorContext";
import { validarSenhaNova } from "@/lib/auth/senhaTutor";

export type ResultadoSenha = { ok: true } | { ok: false; erro: string };

/**
 * Troca a senha do tutor logado e tira o rótulo de "provisória".
 *
 * Duas chamadas de propósito:
 *
 *  1. `supabase.auth.updateUser()` com a sessão do próprio tutor — quem
 *     troca a senha é ele, não a administração.
 *  2. `createAdminClient()` só pra baixar as flags em `tutores`. A 0024 não
 *     deu policy de UPDATE pro tutor (ele só lê), e RLS não sabe restringir
 *     por coluna — um `for update` na tabela deixaria ele reescrever o
 *     próprio telefone, endereço, CPF e até `acesso_liberado`. Service role
 *     com `.eq("id", ...)` explícito é a alternativa mais estreita.
 */
export async function definirNovaSenha(senha: string): Promise<ResultadoSenha> {
  const contexto = await getTutorContext();

  if (!contexto) {
    return { ok: false, erro: "Sua sessão expirou. Entre de novo pra continuar." };
  }

  // Senha provisória vencida não pode virar senha definitiva: seria a forma
  // mais fácil de contornar o prazo que limita a janela da senha padrão.
  if (contexto.senhaProvisoriaVencida) {
    return {
      ok: false,
      erro: "Sua senha de primeiro acesso venceu. Peça pro petshop liberar um acesso novo.",
    };
  }

  const problema = validarSenhaNova(senha);
  if (problema) return { ok: false, erro: problema };

  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password: senha });

  if (error) {
    console.error("Erro ao trocar senha do tutor:", error);
    return {
      ok: false,
      erro: error.message.includes("should be different")
        ? "Escolha uma senha diferente da atual."
        : "Não deu pra trocar a senha agora. Tenta de novo em alguns segundos.",
    };
  }

  const admin = createAdminClient();
  const { error: erroFlag } = await admin
    .from("tutores")
    .update({
      senha_provisoria: false,
      senha_provisoria_expira_em: null,
    })
    .eq("id", contexto.tutor.id);

  if (erroFlag) {
    // A senha JÁ mudou no Auth neste ponto. Falhar aqui deixaria o tutor
    // preso na tela de trocar senha com a senha nova — por isso o erro é
    // explícito sobre o que aconteceu, em vez de genérico.
    console.error("Senha trocada mas flag não baixou:", erroFlag);
    return {
      ok: false,
      erro:
        "Sua senha foi alterada, mas algo falhou ao liberar o portal. Entre de novo com a senha nova.",
    };
  }

  return { ok: true };
}
