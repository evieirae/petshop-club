"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; erro: string };

const ERRO_GENERICO = "Não deu pra salvar. Tenta de novo em alguns segundos.";
const ERRO_PERMISSAO =
  "Nenhuma linha foi alterada — confirme se você tem permissão pra editar esse item.";

// ----------------------------------------------------------------------------
// Transições de status de agendamento (Fase 4 — ver
// supabase/migrations/0003_fase4_assinaturas_agenda.sql). Funciona igual
// pra visita de assinatura e visita avulsa: o UPDATE dispara os triggers do
// banco sozinho —
//   - 'confirmado' carimba confirmado_em
//   - 'pronto'     carimba pronto_em + cria o lembrete pro busca_entrega
//   - 'entregue'   carimba entregue_em + gera a próxima visita (só se for
//                  de assinatura — avulsa não tem próxima automática)
//   - 'faltou'/'cancelado' também geram a próxima visita (se for assinatura),
//     porque são estado terminal do CICLO, não da assinatura inteira — ver
//     nota de "cancelar 1 visita" x "cancelar a assinatura" em
//     app/(app)/tutores/actions.ts
// Nenhuma dessas ações reimplementa essa lógica — só troca o status.
// ----------------------------------------------------------------------------

async function mudarStatus(agendamentoId: string, status: string): Promise<ActionResult> {
  const supabase = createClient();

  const { error, count } = await supabase
    .from("agendamentos")
    .update({ status }, { count: "exact" })
    .eq("id", agendamentoId);

  if (error) {
    console.error(`Erro ao mudar agendamento pra '${status}':`, error);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!count) return { ok: false, erro: ERRO_PERMISSAO };

  revalidatePath("/agenda");
  return { ok: true };
}

export const confirmarAgendamento = (id: string) => mudarStatus(id, "confirmado");
export const marcarPronto = (id: string) => mudarStatus(id, "pronto");
export const marcarEntregue = (id: string) => mudarStatus(id, "entregue");
export const marcarFaltou = (id: string) => mudarStatus(id, "faltou");
export const cancelarAgendamento = (id: string) => mudarStatus(id, "cancelado");

// Diferente das outras: muda data_hora junto — é a mesma visita mudando de
// horário, não fecha o ciclo (ver 0001_init.sql, seção 10: 'reagendado' não
// dispara gerar_proximo_agendamento).
export async function reagendar(agendamentoId: string, novaDataHora: string): Promise<ActionResult> {
  const supabase = createClient();

  const { error, count } = await supabase
    .from("agendamentos")
    .update({ status: "reagendado", data_hora: novaDataHora }, { count: "exact" })
    .eq("id", agendamentoId);

  if (error) {
    console.error("Erro ao reagendar:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!count) return { ok: false, erro: ERRO_PERMISSAO };

  revalidatePath("/agenda");
  return { ok: true };
}

// ----------------------------------------------------------------------------
// Visita avulsa — sem plano, sem assinatura (ver docs/regras_padrao_petshop.md
// e a migration da Fase 4). O preço é travado no momento da criação (snapshot
// de precos_servico pelo porte do pet), do mesmo jeito que plano_precos não é
// recalculado depois — cobrança fica estável mesmo se o preço mudar amanhã.
// ----------------------------------------------------------------------------

export type AgendamentoAvulsoInput = {
  tutor_id: string;
  pet_id: string;
  servico_id: string;
  data_hora: string;
};

export async function criarAgendamentoAvulso(
  petshopId: string,
  dados: AgendamentoAvulsoInput
): Promise<ActionResult> {
  const supabase = createClient();

  const { data: pet, error: erroPet } = await supabase
    .from("pets")
    .select("porte_id")
    .eq("id", dados.pet_id)
    .single();

  if (erroPet || !pet) {
    console.error("Erro ao buscar porte do pet pra visita avulsa:", erroPet);
    return { ok: false, erro: ERRO_GENERICO };
  }

  const { data: precoServico, error: erroPreco } = await supabase
    .from("precos_servico")
    .select("preco")
    .eq("servico_id", dados.servico_id)
    .eq("porte_id", pet.porte_id)
    .single();

  if (erroPreco || !precoServico) {
    return {
      ok: false,
      erro: "Esse serviço não tem preço cadastrado pro porte desse pet — cadastre em Planos & Serviços antes.",
    };
  }

  const { error: erroInsert } = await supabase.from("agendamentos").insert({
    petshop_id: petshopId,
    tutor_id: dados.tutor_id,
    pet_id: dados.pet_id,
    servico_id: dados.servico_id,
    preco_avulso: precoServico.preco,
    data_hora: dados.data_hora,
    status: "agendado",
  });

  if (erroInsert) {
    console.error("Erro ao criar agendamento avulso:", erroInsert);
    return { ok: false, erro: ERRO_GENERICO };
  }

  revalidatePath("/agenda");
  return { ok: true };
}
