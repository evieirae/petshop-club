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
  // Visão Geral (app/(app)/painel/page.tsx) ganhou o quadro de visitas do
  // dia, 18/ago/2026 — confirmar/pronto/entregue também são disparados de
  // lá, e sem isso o quadro só atualizava depois de um refresh manual da
  // página.
  revalidatePath("/painel");
  return { ok: true };
}

export const confirmarAgendamento = (id: string) => mudarStatus(id, "confirmado");
// Migration 0014 (18/ago/2026) — pet chegou, está no banho/tosa agora. Entra
// no fluxo entre "confirmado" e "pronto"; mesmo mudarStatus() de sempre, sem
// lembrete nenhum associado (só pronto/entregue mandam WhatsApp).
export const marcarPresente = (id: string) => mudarStatus(id, "presente");
export const marcarPronto = (id: string) => mudarStatus(id, "pronto");
export const marcarEntregue = (id: string) => mudarStatus(id, "entregue");
export const marcarFaltou = (id: string) => mudarStatus(id, "faltou");
export const cancelarAgendamento = (id: string) => mudarStatus(id, "cancelado");

// ----------------------------------------------------------------------------
// Desfazer um clique errado no quadro de status (Visão Geral e Agenda) — um
// passo por chamada: entregue -> pronto -> presente -> agendado. Chama a
// função do banco (migration 0014_status_presente_e_reversao.sql) em vez de
// fazer o UPDATE aqui: ela precisa ler o status ATUAL pra saber pra onde
// voltar (SELECT ... FOR UPDATE + UPDATE numa transação só, sem race), e já
// limpa o lembrete de WhatsApp ainda pendente da transição desfeita — duas
// coisas que não dá pra fazer com um `.update()` simples feito de fora.
// ----------------------------------------------------------------------------
export async function voltarStatusAgendamento(agendamentoId: string): Promise<ActionResult> {
  const supabase = createClient();

  const { data: novoStatus, error } = await supabase.rpc("voltar_status_agendamento", {
    p_agendamento_id: agendamentoId,
  });

  if (error) {
    console.error("Erro ao voltar status do agendamento:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!novoStatus) {
    return {
      ok: false,
      erro: "Esse status não tem um passo anterior pra voltar (ou você não tem permissão pra editar esse item).",
    };
  }

  revalidatePath("/agenda");
  revalidatePath("/painel");
  return { ok: true };
}

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
  /**
   * Repetição livre (migration 0009). Ausente = visita única.
   *
   * `ocorrencias` conta a visita que está sendo criada agora, então
   * ocorrencias=4 grava serie_restantes=3. Só a PRIMEIRA visita é inserida
   * aqui — as seguintes nascem uma a uma, quando a anterior é resolvida
   * (gerar_proxima_visita_serie). Isso não é economia de código: o trigger
   * de cobrança é AFTER INSERT, então criar as 4 de uma vez geraria as 4
   * cobranças hoje. Ver o cabeçalho da 0009.
   */
  repeticao?: { intervalo_dias: number; ocorrencias: number };
};

/** Preço travado no momento da criação, de precos_servico pelo porte do pet. */
async function precoDaVisita(
  supabase: ReturnType<typeof createClient>,
  petId: string,
  servicoId: string
): Promise<{ ok: true; preco: number } | { ok: false; erro: string }> {
  const { data: pet, error: erroPet } = await supabase
    .from("pets")
    .select("porte_id")
    .eq("id", petId)
    .single();

  if (erroPet || !pet) {
    console.error("Erro ao buscar porte do pet pra visita avulsa:", erroPet);
    return { ok: false, erro: ERRO_GENERICO };
  }

  const { data: precoServico, error: erroPreco } = await supabase
    .from("precos_servico")
    .select("preco")
    .eq("servico_id", servicoId)
    .eq("porte_id", pet.porte_id)
    .single();

  if (erroPreco || !precoServico) {
    return {
      ok: false,
      erro: "Esse serviço não tem preço cadastrado pro porte desse pet — cadastre em Planos & Serviços antes.",
    };
  }

  return { ok: true, preco: precoServico.preco };
}

export async function criarAgendamentoAvulso(
  petshopId: string,
  dados: AgendamentoAvulsoInput
): Promise<ActionResult> {
  const supabase = createClient();

  const preco = await precoDaVisita(supabase, dados.pet_id, dados.servico_id);
  if (!preco.ok) return preco;

  const repeticao = dados.repeticao;
  if (repeticao && (repeticao.intervalo_dias <= 0 || repeticao.ocorrencias < 2)) {
    return { ok: false, erro: "Repetição inválida — escolha a frequência e pelo menos 2 visitas." };
  }

  const { error: erroInsert } = await supabase.from("agendamentos").insert({
    petshop_id: petshopId,
    tutor_id: dados.tutor_id,
    pet_id: dados.pet_id,
    servico_id: dados.servico_id,
    preco_avulso: preco.preco,
    data_hora: dados.data_hora,
    status: "agendado",
    // crypto.randomUUID existe no runtime do Node 18+ e no Edge — o id da
    // série é gerado aqui (e não no banco) porque as ocorrências seguintes
    // copiam este mesmo valor.
    serie_id: repeticao ? crypto.randomUUID() : null,
    serie_intervalo_dias: repeticao ? repeticao.intervalo_dias : null,
    serie_restantes: repeticao ? repeticao.ocorrencias - 1 : null,
  });

  if (erroInsert) {
    console.error("Erro ao criar agendamento avulso:", erroInsert);
    return { ok: false, erro: ERRO_GENERICO };
  }

  revalidatePath("/agenda");
  return { ok: true };
}

// ----------------------------------------------------------------------------
// Encerrar uma repetição livre.
//
// Zera serie_restantes NO MESMO UPDATE que cancela a visita — o trigger é
// AFTER UPDATE e lê NEW, então enxerga 0 e não gera a próxima. Cancelar a
// visita sozinha (cancelarAgendamento) continua gerando a próxima, que é o
// certo pra "cancelar só esta ocorrência". Mesma distinção entre cancelar 1
// visita e cancelar a assinatura inteira documentada em
// app/(app)/tutores/actions.ts.
// ----------------------------------------------------------------------------
export async function encerrarSerie(serieId: string): Promise<ActionResult> {
  const supabase = createClient();

  const { error, count } = await supabase
    .from("agendamentos")
    .update({ status: "cancelado", serie_restantes: 0 }, { count: "exact" })
    .eq("serie_id", serieId)
    .in("status", ["agendado", "confirmado", "reagendado"]);

  if (error) {
    console.error("Erro ao encerrar série:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!count) return { ok: false, erro: ERRO_PERMISSAO };

  revalidatePath("/agenda");
  return { ok: true };
}

// ----------------------------------------------------------------------------
// Recorrência POR PLANO, criada direto da Agenda.
//
// Só faz o insert em `assinaturas`: trg_assinaturas_primeiro_agendamento
// (0001_init.sql) já cria a primeira visita, e daí em diante o ciclo é o
// mesmo de sempre. Idêntico a criarAssinatura de tutores/actions.ts — está
// duplicado aqui só pra revalidar as duas rotas e manter o import da Agenda
// local; se um terceiro lugar precisar, vale extrair pra lib/.
// ----------------------------------------------------------------------------
export type AssinaturaPelaAgendaInput = {
  tutor_id: string;
  pet_id: string;
  plano_id: string;
  dia_semana_preferencial: number; // 0=domingo..6=sabado
  horario_preferencial: string; // "HH:MM"
  data_inicio: string; // "YYYY-MM-DD"
};

export async function criarAssinaturaPelaAgenda(
  petshopId: string,
  dados: AssinaturaPelaAgendaInput
): Promise<ActionResult> {
  const supabase = createClient();

  const { error } = await supabase.from("assinaturas").insert({
    petshop_id: petshopId,
    tutor_id: dados.tutor_id,
    pet_id: dados.pet_id,
    plano_id: dados.plano_id,
    dia_semana_preferencial: dados.dia_semana_preferencial,
    horario_preferencial: dados.horario_preferencial,
    data_inicio: dados.data_inicio,
  });

  if (error) {
    console.error("Erro ao criar assinatura pela agenda:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }

  revalidatePath("/agenda");
  revalidatePath("/tutores");
  return { ok: true };
}

// ----------------------------------------------------------------------------
// Quem executou o serviço (migration 0016). Base da comissão de serviço, e
// também um registro útil por si só ("quem tosou o Thor da última vez?").
//
// Opcional e reversível: passar null limpa o responsável. Não trava por
// status — dá pra corrigir depois que a visita já foi entregue, que é
// justamente quando a equipe percebe que marcou a pessoa errada. Como a
// comissão de serviço é calculada na hora do relatório (e não congelada,
// ver comentário da seção 4 da migration 0016), a correção se reflete
// sozinha no resumo.
// ----------------------------------------------------------------------------
export async function definirFuncionarioAgendamento(
  agendamentoId: string,
  funcionarioId: string | null
): Promise<ActionResult> {
  const supabase = createClient();

  const { error, count } = await supabase
    .from("agendamentos")
    .update({ funcionario_id: funcionarioId }, { count: "exact" })
    .eq("id", agendamentoId);

  if (error) {
    console.error("Erro ao definir responsável pelo agendamento:", error);
    return { ok: false, erro: "Não deu pra salvar. Tenta de novo em alguns segundos." };
  }
  if (!count) {
    return {
      ok: false,
      erro: "Nenhuma linha foi alterada — confirme se você tem permissão pra editar essa visita.",
    };
  }

  revalidatePath("/agenda");
  revalidatePath("/painel");
  return { ok: true };
}
