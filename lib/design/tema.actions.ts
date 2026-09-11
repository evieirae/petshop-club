"use server";

/**
 * Server Action isolada num módulo próprio — ver nota em lib/design/tema.ts.
 * Precisa estar separada porque é importada diretamente por
 * components/tema/ThemeSwitcher.tsx (Client Component): um arquivo puxado
 * por um Client Component não pode ter `next/headers` no escopo do módulo
 * fora de uma Server Action, e tema.ts também exporta `getTemaAtual`, que
 * usa `cookies()` sem ser uma action — misturar os dois no mesmo arquivo é
 * o que quebrava o build.
 */

import { cookies } from "next/headers";
import { TEMA_COOKIE, type Tema } from "./tokens";

/**
 * Chamada pelo ThemeSwitcher ao trocar de tema. Só grava o cookie; quem
 * atualiza a tela na hora é o próprio client component (não precisamos de
 * router.refresh() aqui: nada mais no app depende do tema no servidor, é
 * tudo CSS variable).
 */
export async function definirTema(tema: Tema): Promise<void> {
  cookies().set(TEMA_COOKIE, tema, {
    maxAge: 60 * 60 * 24 * 365, // 1 ano — é preferência de exibição, não sessão de login
    sameSite: "lax",
    path: "/",
  });
}
