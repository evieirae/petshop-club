"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FuncaoFuncionario, Petshop } from "@/types/database";

// Exatamente as colunas parametrizaveis descritas em
// docs/regras_padrao_petshop.md (secoes 1, 2 e 5). Deliberadamente NAO
// inclui nome/cnpj/telefone/endereco nem campos derivados — se o cadastro
// basico do petshop precisar de tela propria, isso e um formulario a parte.
//
// fee_fixo_mensal, percentual_plataforma e isento_fee_ate (secao 3, taxas
// da plataforma) saíram daqui de proposito — ver
// supabase/migrations/0002_admin_plataforma.sql e
// 0017_admin_plataforma_independente.sql: agora so quem tem uma linha em
// admins_plataforma edita isso, pela tela app/(admin)/admin/petshops, nunca
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
  | "intervalo_agendamento_minutos"
  | "horario_envio_lembrete"
  | "horario_corte_confirmacao_manha"
  | "horario_corte_confirmacao_tarde"
  | "horario_limite_petshop_tarde"
  | "falta_consome_visita_paga"
  // Migration 0016 — comissão. Fica aqui (e não numa tela nova) por decisão
  // do Eduardo: é parâmetro de operação do petshop, do mesmo naipe do
  // expediente. Percentuais em ponto percentual (5 = 5%), ao contrário de
  // percentual_plataforma.
  | "comissao_ativa"
  | "comissao_percentual_venda"
  | "comissao_percentual_servico"
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

// ----------------------------------------------------------------------------
// Funcionários (migration 0016) — cadastro simples, SEM login. Mora em
// Configurações junto com os percentuais de comissão porque é a mesma
// decisão administrativa ("quem trabalha aqui e quanto cada um ganha por
// venda/serviço"), não uma tarefa do dia a dia.
//
// Nenhuma ação de exclusão: funcionário que saiu vira ativo=false. Apagar
// quebraria o histórico (vendas.funcionario_id, agendamentos.funcionario_id
// são ON DELETE SET NULL — a venda sobreviveria, mas sem saber quem vendeu,
// e a comissão já paga viraria órfã).
// ----------------------------------------------------------------------------

export type FuncionarioInput = {
  nome: string;
  funcao: FuncaoFuncionario;
  telefone: string | null;
  comissao_percentual_venda: number | null;
  comissao_percentual_servico: number | null;
};

export async function criarFuncionario(
  petshopId: string,
  dados: FuncionarioInput
): Promise<UpdateConfigResult> {
  const supabase = createClient();

  const { error } = await supabase.from("funcionarios").insert({
    petshop_id: petshopId,
    nome: dados.nome.trim(),
    funcao: dados.funcao,
    telefone: dados.telefone?.trim() || null,
    comissao_percentual_venda: dados.comissao_percentual_venda,
    comissao_percentual_servico: dados.comissao_percentual_servico,
  });

  if (error) {
    console.error("Erro ao criar funcionário:", error);
    return { ok: false, erro: "Não deu pra salvar. Tenta de novo em alguns segundos." };
  }

  revalidatePath("/configuracoes");
  revalidatePath("/vendas");
  revalidatePath("/agenda");
  return { ok: true };
}

export async function atualizarFuncionario(
  funcionarioId: string,
  dados: FuncionarioInput
): Promise<UpdateConfigResult> {
  const supabase = createClient();

  const { error, count } = await supabase
    .from("funcionarios")
    .update(
      {
        nome: dados.nome.trim(),
        funcao: dados.funcao,
        telefone: dados.telefone?.trim() || null,
        comissao_percentual_venda: dados.comissao_percentual_venda,
        comissao_percentual_servico: dados.comissao_percentual_servico,
      },
      { count: "exact" }
    )
    .eq("id", funcionarioId);

  if (error) {
    console.error("Erro ao atualizar funcionário:", error);
    return { ok: false, erro: "Não deu pra salvar. Tenta de novo em alguns segundos." };
  }
  if (!count) {
    return {
      ok: false,
      erro: "Nenhuma linha foi alterada — confirme se você tem permissão pra editar esse funcionário.",
    };
  }

  revalidatePath("/configuracoes");
  revalidatePath("/vendas");
  revalidatePath("/agenda");
  return { ok: true };
}

export async function alternarAtivoFuncionario(
  funcionarioId: string,
  ativo: boolean
): Promise<UpdateConfigResult> {
  const supabase = createClient();

  const { error, count } = await supabase
    .from("funcionarios")
    .update({ ativo }, { count: "exact" })
    .eq("id", funcionarioId);

  if (error) {
    console.error("Erro ao ativar/desativar funcionário:", error);
    return { ok: false, erro: "Não deu pra salvar. Tenta de novo em alguns segundos." };
  }
  if (!count) {
    return {
      ok: false,
      erro: "Nenhuma linha foi alterada — confirme se você tem permissão pra editar esse funcionário.",
    };
  }

  revalidatePath("/configuracoes");
  revalidatePath("/vendas");
  revalidatePath("/agenda");
  return { ok: true };
}
