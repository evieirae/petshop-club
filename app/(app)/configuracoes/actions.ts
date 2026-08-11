"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Petshop } from "@/types/database";

// Exatamente as colunas parametrizaveis descritas em
// docs/regras_padrao_petshop.md (secoes 1, 2 e 5). Deliberadamente NAO
// inclui nome/cnpj/telefone/endereco nem campos derivados — se o cadastro
// basico do petshop precisar de tela propria, isso e um formulario a parte.
//
// fee_fixo_mensal, percentual_plataforma e isento_fee_ate (secao 3, taxas
// da plataforma) saíram daqui de proposito — ver
// supabase/migrations/0002_admin_plataforma.sql: agora so quem tem
// eh_admin_plataforma=true edita isso, pela tela app/(app)/admin, nunca
// pela tela de Configuracoes do petshop. Mesmo que alguem reinclua esses
// campos aqui por engano, o trigger no banco bloqueia o UPDATE — mas o
// certo e nem tentar enviar.
export type PetshopConfigInput = Pick<
  Petshop,
  | "hora_abertura"
  | "hora_fechamento"
  | "hora_inicio_intervalo"
  | "hora_fim_intervalo"
  | "hora_divisao_periodo"
  | "horario_envio_lembrete"
  | "horario_corte_confirmacao_manha"
  | "horario_corte_confirmacao_tarde"
  | "horario_limite_petshop_tarde"
  | "falta_consome_visita_paga"
>;

export type UpdateConfigResult = { ok: true } | { ok: false; erro: string };

/**
 * Atualiza as colunas parametrizaveis de um petshop. Nao precisa checar
 * "esse petshop_id e realmente do usuario logado" aqui — a policy
 * isolamento_petshop (RLS) ja rejeita silenciosamente (0 linhas afetadas)
 * qualquer id que nao bata com auth_petshop_id(). Por isso o count de linhas
 * afetadas e checado abaixo, nao so o campo `error`.
 */
export async function updatePetshopConfig(
  petshopId: string,
  dados: PetshopConfigInput
): Promise<UpdateConfigResult> {
  const supabase = createClient();

  const { error, count } = await supabase
    .from("petshops")
    .update(dados, { count: "exact" })
    .eq("id", petshopId);

  if (error) {
    console.error("Erro ao salvar configuracoes do petshop:", error);
    return {
      ok: false,
      erro: "Não deu pra salvar. Tenta de novo em alguns segundos.",
    };
  }

  if (!count) {
    return {
      ok: false,
      erro: "Nenhuma linha foi alterada — confirme se você tem permissão pra editar esse petshop.",
    };
  }

  revalidatePath("/configuracoes");
  return { ok: true };
}
