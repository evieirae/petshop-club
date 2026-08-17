"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { gerarHorariosDisponiveis, type ExpedientePetshop } from "@/lib/horarios";

// Rota pública (fora do grupo (app), sem sessão) — mesmo padrão de
// app/(public)/cadastro/[tutorId]/actions.ts: usa a service_role key
// porque quem preenche isso não tem como logar. Ver lib/supabase/admin.ts
// pras regras de uso (SEMPRE filtrar por id explícito nas queries).
//
// Escopo desta fase (docs/fase6_pagamentos.md, seção 7): "agendar + pagar"
// — tutor escolhe pet/serviço/horário livre na grade do petshop e a visita
// nasce como avulsa (mesmo caminho de app/(app)/agenda/actions.ts
// criarAgendamentoAvulso, preço travado no momento do agendamento).
//
// PAGAMENTO NÃO É SÍNCRONO NESTA VERSÃO — ver nota no fim de
// agendarEPagar() pro porquê.

const ERRO_GENERICO = "Não deu pra agendar. Tenta de novo em alguns segundos.";

export type HorarioDisponivel = { horario: string; livre: boolean };

/**
 * Horários da grade do petshop (lib/horarios.ts) pra uma data, marcando
 * quais já estão ocupados (agendamentos_slot_unico da migration 0006 é a
 * trava de verdade contra corrida — isto aqui é só a UI mostrando o que já
 * sabe que vai falhar, pra não fazer o tutor escolher um horário morto).
 */
export async function buscarHorariosDisponiveis(
  petshopId: string,
  data: string // "YYYY-MM-DD"
): Promise<HorarioDisponivel[]> {
  const supabase = createAdminClient();

  const { data: petshop } = await supabase
    .from("petshops")
    .select("hora_abertura, hora_fechamento, hora_inicio_intervalo, hora_fim_intervalo, intervalo_agendamento_minutos")
    .eq("id", petshopId)
    .maybeSingle();

  if (!petshop) return [];

  const todos = gerarHorariosDisponiveis(petshop as ExpedientePetshop);

  // Brasil não observa horário de verão desde 2019 — offset fixo -03:00 é
  // seguro (mesma premissa de fuso fixo America/Sao_Paulo já usada em toda
  // a Fase 5, ver 0005_fase5_lembretes_whatsapp.sql).
  const inicioDia = `${data}T00:00:00-03:00`;
  const fimDia = `${data}T23:59:59-03:00`;

  const { data: ocupados } = await supabase
    .from("agendamentos")
    .select("data_hora")
    .eq("petshop_id", petshopId)
    .in("status", ["agendado", "confirmado"])
    .gte("data_hora", inicioDia)
    .lte("data_hora", fimDia);

  const horariosOcupados = new Set(
    (ocupados ?? []).map((a) => {
      const d = new Date(a.data_hora as string);
      return d.toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      });
    })
  );

  return todos.map((horario) => ({ horario, livre: !horariosOcupados.has(horario) }));
}

export type AgendarInput = {
  pet_id: string;
  servico_id: string;
  data: string; // "YYYY-MM-DD"
  horario: string; // "HH:MM"
};

export type AgendarResult =
  | { ok: true; valor: number }
  | { ok: false; erro: string };

export async function agendarEPagar(tutorId: string, dados: AgendarInput): Promise<AgendarResult> {
  const supabase = createAdminClient();

  const { data: tutor, error: erroTutor } = await supabase
    .from("tutores")
    .select("id, petshop_id")
    .eq("id", tutorId)
    .maybeSingle();

  if (erroTutor || !tutor) {
    return { ok: false, erro: "Link inválido — peça um novo link ao petshop." };
  }

  // Confirma que o pet é mesmo desse tutor — mesma trava de "id de outra
  // pessoa colado por engano" usada em enviarCadastro().
  const { data: pet, error: erroPet } = await supabase
    .from("pets")
    .select("id, porte_id")
    .eq("id", dados.pet_id)
    .eq("tutor_id", tutorId)
    .maybeSingle();

  if (erroPet || !pet) {
    return { ok: false, erro: "Pet não encontrado." };
  }

  const { data: precoServico, error: erroPreco } = await supabase
    .from("precos_servico")
    .select("preco")
    .eq("servico_id", dados.servico_id)
    .eq("porte_id", pet.porte_id)
    .maybeSingle();

  if (erroPreco || !precoServico) {
    return { ok: false, erro: "Esse serviço não está disponível pro porte desse pet." };
  }

  const dataHora = `${dados.data}T${dados.horario}:00-03:00`;

  const { error: erroInsert } = await supabase.from("agendamentos").insert({
    petshop_id: tutor.petshop_id,
    tutor_id: tutorId,
    pet_id: dados.pet_id,
    servico_id: dados.servico_id,
    preco_avulso: precoServico.preco,
    data_hora: dataHora,
    status: "agendado",
  });

  if (erroInsert) {
    // 23505 = unique_violation — agendamentos_slot_unico (migration 0006)
    // pegou uma corrida (dois tutores clicando no mesmo horário quase
    // junto). Mensagem específica em vez do erro genérico.
    if (erroInsert.code === "23505") {
      return { ok: false, erro: "Esse horário acabou de ser ocupado. Escolha outro, por favor." };
    }
    console.error("Erro ao criar agendamento avulso pelo portal do tutor:", erroInsert);
    return { ok: false, erro: ERRO_GENERICO };
  }

  // O insert acima dispara trg_agendamento_processar_cobranca (0003), que
  // já cria a linha em cobrancas_avulsas com status='pendente'.
  //
  // NÃO cobramos aqui, na hora — o plano (docs/fase6_pagamentos.md, seção
  // 7) prevê pagamento síncrono (mostrar QR Pix ou confirmar cartão na
  // mesma tela), mas isso exige chamar o gateway a partir do runtime
  // Next.js, e o cliente do gateway escrito até agora
  // (supabase/functions/_shared/asaas.ts) é Deno, não testado, e vive nas
  // Edge Functions. Duplicar esse cliente pro lado Next.js antes de ter
  // testado UM dos dois contra o sandbox pareceu pior do que deixar
  // explícito: por enquanto, processar-cobrancas (cron a cada 15min) pega
  // essa cobrança pendente e processa — o tutor só não vê o QR/confirmação
  // na mesma tela ainda. Fechar esse gap é o próximo passo depois que a
  // fatia 0-3 do plano estiver rodando de verdade.
  return { ok: true, valor: precoServico.preco as number };
}
