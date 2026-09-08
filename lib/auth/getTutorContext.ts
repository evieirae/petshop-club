import { createClient } from "@/lib/supabase/server";
import type { Petshop, Tutor } from "@/types/database";

export interface TutorContext {
  tutor: Tutor;
  /** Só o que o portal precisa mostrar — nunca a linha inteira de petshops. */
  petshop: Pick<Petshop, "id" | "nome" | "telefone" | "endereco">;
  /** true = a senha ainda é a que a administração definiu. */
  precisaTrocarSenha: boolean;
  /** true = a senha provisória venceu; o acesso não vale mais. */
  senhaProvisoriaVencida: boolean;
}

/**
 * Terceiro irmão de getUsuarioContext() (equipe) e getAdminContext()
 * (plataforma): resolve a sessão como TUTOR. Ver
 * supabase/migrations/0024_portal_tutor_acesso.sql.
 *
 * Devolve null quando não há sessão, ou quando a sessão existe mas não é de
 * um tutor liberado — o que inclui o dono de petshop e o admin, que passam
 * por aqui sem casar com nada.
 *
 * A query lê de `petshops_vitrine`, não de `petshops` (migrations
 * 0028/0029, checklist de segurança #15/#17, 07/set/2026): antes, a policy
 * "vitrine_tutor" liberava a LINHA INTEIRA do petshop pro tutor — RLS
 * restringe linha, não coluna — então mesmo um `select` explícito aqui não
 * impedia um tutor de chamar a REST API direto e ler fee_fixo_mensal/
 * percentual_plataforma/cnpj/gateway_wallet_id. A view (security_invoker,
 * RLS da tabela base continua valendo) só expõe colunas sem valor
 * comercial sensível — quem pode ver a linha continua sendo decidido pela
 * policy "vitrine_tutor", inalterada; a view só limita as colunas.
 */
export async function getTutorContext(): Promise<TutorContext | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: tutor } = await supabase
    .from("tutores")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!tutor) return null;

  const tutorTipado = tutor as Tutor;

  // Cinto e suspensório: auth_tutor_id() já filtra por acesso_liberado e
  // ativo no banco (então o select acima nem deveria retornar linha), mas a
  // checagem aqui deixa o motivo explícito pra quem lê a tela.
  if (!tutorTipado.acesso_liberado || !tutorTipado.ativo) return null;

  const { data: petshop } = await supabase
    .from("petshops_vitrine")
    .select("id, nome, telefone, endereco")
    .eq("id", tutorTipado.petshop_id)
    .maybeSingle();

  const vencida =
    tutorTipado.senha_provisoria &&
    tutorTipado.senha_provisoria_expira_em !== null &&
    new Date(tutorTipado.senha_provisoria_expira_em) < new Date();

  return {
    tutor: tutorTipado,
    petshop: (petshop as TutorContext["petshop"]) ?? {
      id: tutorTipado.petshop_id,
      nome: "seu petshop",
      telefone: null,
      endereco: null,
    },
    precisaTrocarSenha: tutorTipado.senha_provisoria,
    senhaProvisoriaVencida: Boolean(vencida),
  };
}
