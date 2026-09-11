/**
 * ============================================================================
 *  PETCLUB — TEMA ATIVO (qual das 4 paletas de lib/design/tokens.ts está em uso)
 * ============================================================================
 *
 * Persistência: cookie de sessão simples (não por usuário, não por petshop —
 * é a opção mais barata e cobre o caso de uso real, que é preferência de
 * quem está com a mão no tablet/computador naquele momento, não uma
 * configuração do negócio). Se um dia isso precisar ser "o dono decidiu o
 * tema do petshop", vira coluna em `petshops` — não antes de precisar.
 *
 * Fluxo:
 *   1. app/layout.tsx lê o cookie no Server Component e escreve
 *      `<html data-tema={tema}>` — o HTML já chega do servidor com o tema
 *      certo, sem "flash" do tema padrão antes de hidratar.
 *   2. components/tema/ThemeSwitcher.tsx troca `document.documentElement`
 *      na hora (feedback instantâneo — é só CSS variable, não precisa
 *      recarregar nada) e chama `definirTema()` pra persistir no cookie.
 */

import { cookies } from "next/headers";
import { temas, TEMA_PADRAO, type Tema } from "./tokens";

export const TEMA_COOKIE = "petclub-tema";

/** Type guard — protege contra cookie adulterado/de uma versão antiga do app. */
function ehTemaValido(valor: string | undefined): valor is Tema {
  return !!valor && (temas as readonly string[]).includes(valor);
}

/** Server Component / Server Action only — lê o cookie da requisição atual. */
export function getTemaAtual(): Tema {
  const valor = cookies().get(TEMA_COOKIE)?.value;
  return ehTemaValido(valor) ? valor : TEMA_PADRAO;
}

/**
 * Server Action — chamada pelo ThemeSwitcher (client component) ao trocar
 * de tema. Só grava o cookie; quem atualiza a tela na hora é o próprio
 * client component (não precisamos de router.refresh() aqui: nada mais no
 * app depende do tema no servidor, é tudo CSS variable).
 */
export async function definirTema(tema: Tema): Promise<void> {
  "use server";
  cookies().set(TEMA_COOKIE, tema, {
    maxAge: 60 * 60 * 24 * 365, // 1 ano — é preferência de exibição, não sessão de login
    sameSite: "lax",
    path: "/",
  });
}
