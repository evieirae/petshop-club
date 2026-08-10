"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; erro: string };

const ERRO_GENERICO = "Não deu pra salvar. Tenta de novo em alguns segundos.";
const ERRO_PERMISSAO =
  "Nenhuma linha foi alterada — confirme se você tem permissão pra editar esse item.";

// ----------------------------------------------------------------------------
// Serviços (servicos + precos_servico)
// ----------------------------------------------------------------------------

export type ServicoInput = {
  categoria_servico_id: number;
  nome_customizado: string | null;
};

export async function criarServico(
  petshopId: string,
  dados: ServicoInput
): Promise<ActionResult> {
  const supabase = createClient();

  const { error } = await supabase.from("servicos").insert({
    petshop_id: petshopId,
    categoria_servico_id: dados.categoria_servico_id,
    nome_customizado: dados.nome_customizado,
  });

  if (error) {
    console.error("Erro ao criar servico:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }

  revalidatePath("/planos");
  return { ok: true };
}

export async function atualizarServico(
  servicoId: string,
  dados: ServicoInput
): Promise<ActionResult> {
  const supabase = createClient();

  const { error, count } = await supabase
    .from("servicos")
    .update(dados, { count: "exact" })
    .eq("id", servicoId);

  if (error) {
    console.error("Erro ao atualizar servico:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!count) return { ok: false, erro: ERRO_PERMISSAO };

  revalidatePath("/planos");
  return { ok: true };
}

// Não existe "excluir serviço" — só desativa. precos_servico e plano_servicos
// referenciam servico_id, então apagar de verdade quebraria plano já montado.
export async function alternarAtivoServico(
  servicoId: string,
  ativo: boolean
): Promise<ActionResult> {
  const supabase = createClient();

  const { error, count } = await supabase
    .from("servicos")
    .update({ ativo }, { count: "exact" })
    .eq("id", servicoId);

  if (error) {
    console.error("Erro ao atualizar servico:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!count) return { ok: false, erro: ERRO_PERMISSAO };

  revalidatePath("/planos");
  return { ok: true };
}

// Grava o preço avulso do serviço nos 4 portes de uma vez (upsert por
// servico_id + porte_id — é a unique constraint da tabela).
export async function salvarPrecosServico(
  servicoId: string,
  precos: { porte_id: number; preco: number }[]
): Promise<ActionResult> {
  const supabase = createClient();

  const { error } = await supabase.from("precos_servico").upsert(
    precos.map((p) => ({
      servico_id: servicoId,
      porte_id: p.porte_id,
      preco: p.preco,
    })),
    { onConflict: "servico_id,porte_id" }
  );

  if (error) {
    console.error("Erro ao salvar precos do servico:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }

  revalidatePath("/planos");
  return { ok: true };
}

// ----------------------------------------------------------------------------
// Planos (planos + plano_servicos + plano_precos)
// ----------------------------------------------------------------------------

export type PlanoInput = {
  nome: string;
  intervalo_dias: number;
  ocorrencias_padrao_mes: number;
};

export async function criarPlano(
  petshopId: string,
  dados: PlanoInput
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("planos")
    .insert({
      petshop_id: petshopId,
      nome: dados.nome,
      intervalo_dias: dados.intervalo_dias,
      ocorrencias_padrao_mes: dados.ocorrencias_padrao_mes,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Erro ao criar plano:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }

  revalidatePath("/planos");
  return { ok: true, id: data.id as string };
}

export async function atualizarPlano(
  planoId: string,
  dados: PlanoInput
): Promise<ActionResult> {
  const supabase = createClient();

  const { error, count } = await supabase
    .from("planos")
    .update(dados, { count: "exact" })
    .eq("id", planoId);

  if (error) {
    console.error("Erro ao atualizar plano:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!count) return { ok: false, erro: ERRO_PERMISSAO };

  revalidatePath("/planos");
  return { ok: true };
}

// Mesma lógica dos serviços: desativa, não apaga (assinaturas vão referenciar
// plano_id mais pra frente, na Fase 4).
export async function alternarAtivoPlano(
  planoId: string,
  ativo: boolean
): Promise<ActionResult> {
  const supabase = createClient();

  const { error, count } = await supabase
    .from("planos")
    .update({ ativo }, { count: "exact" })
    .eq("id", planoId);

  if (error) {
    console.error("Erro ao atualizar plano:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!count) return { ok: false, erro: ERRO_PERMISSAO };

  revalidatePath("/planos");
  return { ok: true };
}

// plano_servicos não tem coluna id própria (chave composta) — a forma mais
// simples de "salvar o checklist inteiro" é substituir a lista toda, não
// tentar diffar item a item.
export async function salvarPlanoServicos(
  planoId: string,
  servicoIds: string[]
): Promise<ActionResult> {
  const supabase = createClient();

  const { error: erroDelete } = await supabase
    .from("plano_servicos")
    .delete()
    .eq("plano_id", planoId);

  if (erroDelete) {
    console.error("Erro ao limpar servicos do plano:", erroDelete);
    return { ok: false, erro: ERRO_GENERICO };
  }

  if (servicoIds.length > 0) {
    const { error: erroInsert } = await supabase.from("plano_servicos").insert(
      servicoIds.map((servico_id) => ({ plano_id: planoId, servico_id }))
    );

    if (erroInsert) {
      console.error("Erro ao salvar servicos do plano:", erroInsert);
      return { ok: false, erro: ERRO_GENERICO };
    }
  }

  revalidatePath("/planos");
  return { ok: true };
}

// Preço da assinatura por porte — igual a salvarPrecosServico, mas na tabela
// plano_precos (unique: plano_id + porte_id).
export async function salvarPlanoPrecos(
  planoId: string,
  precos: { porte_id: number; preco_assinatura: number }[]
): Promise<ActionResult> {
  const supabase = createClient();

  const { error } = await supabase.from("plano_precos").upsert(
    precos.map((p) => ({
      plano_id: planoId,
      porte_id: p.porte_id,
      preco_assinatura: p.preco_assinatura,
    })),
    { onConflict: "plano_id,porte_id" }
  );

  if (error) {
    console.error("Erro ao salvar precos do plano:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }

  revalidatePath("/planos");
  return { ok: true };
}
