"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/auth/getAdminContext";
import { getUsuarioContext } from "@/lib/auth/getContext";
import { getTutorContext } from "@/lib/auth/getTutorContext";

/**
 * Pra onde mandar quem acabou de entrar.
 *
 * Até a 0024 essa pergunta não existia: todo login caía em /painel e o
 * layout de cada área corrigia o rumo depois (admin sem petshop era
 * redirecionado de /painel pra /admin). Com o tutor entrando na roda isso
 * deixou de servir — tutor não tem petshop nem admin, e cairia direto na
 * tela de "acesso pendente".
 *
 * A ordem é de privilégio, não de preferência: quem é admin da plataforma
 * vai pro /admin mesmo que também seja dono de um petshop, porque é o
 * contexto mais amplo e ele consegue navegar pro resto de lá.
 *
 * GAP CONHECIDO: uma pessoa com duas identidades (o caso real é você, admin
 * da plataforma e tutor de teste em algum petshop) sempre cai na de cima,
 * sem escolha. O plano prevê um seletor "Entrar como…" — ver
 * claude/plano-home-3-acessos-portal-tutor.md, item 2. Enquanto ele não
 * existe, teste o portal do tutor com um e-mail separado.
 */
export type DestinoLogin =
  | { destino: string }
  | { erro: string };

export async function destinoPosLogin(): Promise<DestinoLogin> {
  const admin = await getAdminContext();
  if (admin) return { destino: "/admin" };

  const equipe = await getUsuarioContext();
  if (equipe?.usuario && equipe.petshop) return { destino: "/painel" };

  const tutor = await getTutorContext();
  if (tutor) {
    // Senha provisória vencida: o acesso não vale mais. Derruba a sessão
    // aqui mesmo, senão a pessoa fica logada num portal que não abre nada —
    // e a janela de risco da senha padrão continuaria aberta na prática.
    if (tutor.senhaProvisoriaVencida) {
      const supabase = createClient();
      await supabase.auth.signOut();
      return {
        erro:
          "Sua senha de primeiro acesso venceu. Peça pro petshop liberar um acesso novo.",
      };
    }

    // Carimba o acesso. Service role porque o tutor nao tem policy de UPDATE
    // em `tutores` (0024) — mesma justificativa da troca de senha. Falha aqui
    // nao pode impedir o login, entao o erro so vai pro log.
    try {
      await createAdminClient()
        .from("tutores")
        .update({ ultimo_login_em: new Date().toISOString() })
        .eq("id", tutor.tutor.id);
    } catch (erro) {
      console.error("Nao deu pra carimbar ultimo_login_em do tutor:", erro);
    }

    return {
      destino: tutor.precisaTrocarSenha
        ? "/minha-conta/nova-senha"
        : "/minha-conta",
    };
  }

  // Sessão válida que não casou com nenhuma das três identidades. /painel é
  // quem sabe explicar isso ("Acesso pendente"), então continua sendo o
  // destino — só que agora por decisão, não por falta de alternativa.
  return { destino: "/painel" };
}
