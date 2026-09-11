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
 *      recarregar nada) e chama `definirTema()` (lib/design/tema.actions.ts)
 *      pra persistir no cookie.
 *
 * A Server Action `definirTema` mora em lib/design/tema.actions.ts, não
 * aqui: este arquivo importa `next/headers` fora de uma Server Action (em
 * `getTemaAtual`), e é importado por components/tema/ThemeSwitcher.tsx, um
 * Client Component — misturar os dois no mesmo arquivo quebra o build
 * ("You're importing a component that needs next/headers" + "It is not
 * allowed to define inline 'use server' ... in Client Components").
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
