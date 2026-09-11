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
 * Este arquivo usa `next/headers`, então é seguro de importar só por Server
 * Components — NUNCA por um Client Component. É por isso que a Server
 * Action `definirTema` mora num arquivo separado (tema.actions.ts): assim o
 * ThemeSwitcher (client) nunca puxa este módulo pro bundle do navegador.
 */

import { cookies } from "next/headers";
import { temas, TEMA_PADRAO, TEMA_COOKIE, type Tema } from "./tokens";

/** Type guard — protege contra cookie adulterado/de uma versão antiga do app. */
function ehTemaValido(valor: string | undefined): valor is Tema {
  return !!valor && (temas as readonly string[]).includes(valor);
}

/** Server Component only — lê o cookie da requisição atual. */
export function getTemaAtual(): Tema {
  const valor = cookies().get(TEMA_COOKIE)?.value;
  return ehTemaValido(valor) ? valor : TEMA_PADRAO;
}
