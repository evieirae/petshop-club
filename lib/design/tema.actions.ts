"use server";

/**
 * Server Action isolada em arquivo próprio (com "use server" no TOPO do
 * arquivo, não dentro da função) — é o único jeito suportado pelo Next.js de
 * expor uma Server Action pra um Client Component. Ela vivia junto com
 * `getTemaAtual()` em lib/design/tema.ts, que importa `next/headers` fora de
 * um contexto de Server Action; como components/tema/ThemeSwitcher.tsx (client
 * component) importava direto desse arquivo, o build quebrava:
 *
 *   "You're importing a component that needs next/headers..."
 *   "It is not allowed to define inline 'use server' annotated Server
 *    Actions in Client Components."
 *
 * ver lib/design/tema.ts para o resto do fluxo (leitura do cookie no server).
 */

import { cookies } from "next/headers";
import { TEMA_COOKIE } from "./tema";
import type { Tema } from "./tokens";

export async function definirTema(tema: Tema): Promise<void> {
  cookies().set(TEMA_COOKIE, tema, {
    maxAge: 60 * 60 * 24 * 365, // 1 ano — é preferência de exibição, não sessão de login
    sameSite: "lax",
    path: "/",
  });
}
