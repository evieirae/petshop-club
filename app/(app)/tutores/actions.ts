"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { PapelContato } from "@/types/database";

// Estados de agendamento que ainda não chegaram a um resultado final — são os
// que "pausar"/"cancelar" assinatura precisam resolver pra não deixar visita
// órfã na agenda. Ver NAO_TERMINAIS_PARA_PAUSA abaixo pra por que 'pronto'
// fica de fora do caso de pausa.
const NAO_TERMINAIS = ["agendado", "confirmado", "reagendado", "pronto"] as const;

export type ActionResult = { ok: true } | { ok: false; erro: string };

const ERRO_GENERICO = "Não deu pra salvar. Tenta de novo em alguns segundos.";
const ERRO_PERMISSAO =
  "Nenhuma linha foi alterada — confirme se você tem permissão pra editar esse item.";

// ----------------------------------------------------------------------------
// Tutores
// ----------------------------------------------------------------------------

// Cadastro inicial é deliberadamente so telefone (ver docs/regras_padrao_petshop.md
// secao 6: "o petshop cadastra so o telefone e a plataforma manda um link").
// nome/email/endereco entram depois, pelo formulario publico ou por edicao
// manual da equipe — mas a coluna tutores.nome e NOT NULL, entao usamos o
// proprio telefone como nome provisorio quando a equipe nao informa nada.
export type NovoTutorInput = {
  telefone: string;
  nome: string | null;
};

export async function criarTutor(
  petshopId: string,
  dados: NovoTutorInput
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("tutores")
    .insert({
      petshop_id: petshopId,
      telefone: dados.telefone,
      nome: dados.nome?.trim() || dados.telefone,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Erro ao criar tutor:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }

  revalidatePath("/tutores");
  return { ok: true, id: data.id as string };
}

export type TutorInput = {
  nome: string;
  telefone: string;
  email: string | null;
  endereco: string | null;
  cadastro_completo: boolean;
};

// Edicao manual pela equipe — cobre o caso do tutor que preenche tudo no
// balcao em vez de usar o link (ou correcao de um dado que o proprio tutor
// digitou errado). cadastro_completo fica editavel aqui de proposito: o
// formulario publico (app/(public)/cadastro/[tutorId]/actions.ts) tambem
// marca sozinho quando é o tutor que envia.
export async function atualizarTutor(
  tutorId: string,
  dados: TutorInput
): Promise<ActionResult> {
  const supabase = createClient();

  const { error, count } = await supabase
    .from("tutores")
    .update({
      nome: dados.nome.trim(),
      telefone: dados.telefone.trim(),
      email: dados.email?.trim() || null,
      endereco: dados.endereco?.trim() || null,
      cadastro_completo: dados.cadastro_completo,
    }, { count: "exact" })
    .eq("id", tutorId);

  if (error) {
    console.error("Erro ao atualizar tutor:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!count) return { ok: false, erro: ERRO_PERMISSAO };

  revalidatePath("/tutores");
  return { ok: true };
}

// Cria o registro em `lembretes` (tipo='cadastro') que documenta o convite
// enviado — mesmo padrao usado pro lembrete de confirmacao D-1 (ver secao 8
// do schema). O ENVIO de fato via WhatsApp é Fase 5 do roadmap; por enquanto
// isso so guarda o "pedido pendente" pro histórico e a UI mostra o link pra
// equipe copiar/mandar na mao.
export async function gerarLinkCadastro(tutorId: string): Promise<ActionResult> {
  const supabase = createClient();

  const { error } = await supabase.from("lembretes").insert({
    tutor_id: tutorId,
    tipo: "cadastro",
    destinatario: "tutor",
    canal: "whatsapp",
    status: "pendente",
  });

  if (error) {
    console.error("Erro ao gerar lembrete de cadastro:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }

  revalidatePath("/tutores");
  return { ok: true };
}

// ----------------------------------------------------------------------------
// Pets
// ----------------------------------------------------------------------------

export type PetInput = {
  nome: string;
  porte_id: number;
  raca: string | null;
  observacoes: string | null;
};

export async function criarPet(
  petshopId: string,
  tutorId: string,
  dados: PetInput
): Promise<ActionResult> {
  const supabase = createClient();

  const { error } = await supabase.from("pets").insert({
    petshop_id: petshopId,
    tutor_id: tutorId,
    nome: dados.nome.trim(),
    porte_id: dados.porte_id,
    raca: dados.raca?.trim() || null,
    observacoes: dados.observacoes?.trim() || null,
  });

  if (error) {
    console.error("Erro ao criar pet:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }

  revalidatePath("/tutores");
  return { ok: true };
}

export async function atualizarPet(petId: string, dados: PetInput): Promise<ActionResult> {
  const supabase = createClient();

  const { error, count } = await supabase
    .from("pets")
    .update({
      nome: dados.nome.trim(),
      porte_id: dados.porte_id,
      raca: dados.raca?.trim() || null,
      observacoes: dados.observacoes?.trim() || null,
    }, { count: "exact" })
    .eq("id", petId);

  if (error) {
    console.error("Erro ao atualizar pet:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!count) return { ok: false, erro: ERRO_PERMISSAO };

  revalidatePath("/tutores");
  return { ok: true };
}

// Diferente de servicos/planos, pet pode ser removido de verdade — nao ha
// ainda nenhuma assinatura (Fase 4) que dependa dele. Quando essa fase
// existir, um pet com assinatura ativa vai falhar aqui por causa da FK
// (assinaturas.pet_id references pets(id), sem cascade) — o erro generico
// abaixo ja cobre esse caso, so nao com uma mensagem especifica ainda.
export async function removerPet(petId: string): Promise<ActionResult> {
  const supabase = createClient();

  const { error, count } = await supabase
    .from("pets")
    .delete({ count: "exact" })
    .eq("id", petId);

  if (error) {
    console.error("Erro ao remover pet:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!count) return { ok: false, erro: ERRO_PERMISSAO };

  revalidatePath("/tutores");
  return { ok: true };
}

// ----------------------------------------------------------------------------
// Contato adicional por papel (docs/regras_padrao_petshop.md secao 5)
// ----------------------------------------------------------------------------

export type ContatoAdicionalInput = {
  papel: PapelContato;
  nome: string;
  telefone: string;
};

// unique(tutor_id, papel) na tabela — upsert cobre criar e editar com a
// mesma chamada, sem precisar diferenciar "novo contato" de "trocar quem
// busca o pet".
export async function salvarContatoAdicional(
  petshopId: string,
  tutorId: string,
  dados: ContatoAdicionalInput
): Promise<ActionResult> {
  const supabase = createClient();

  const { error } = await supabase.from("contatos_adicionais").upsert(
    {
      petshop_id: petshopId,
      tutor_id: tutorId,
      papel: dados.papel,
      nome: dados.nome.trim(),
      telefone: dados.telefone.trim(),
    },
    { onConflict: "tutor_id,papel" }
  );

  if (error) {
    console.error("Erro ao salvar contato adicional:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }

  revalidatePath("/tutores");
  return { ok: true };
}

export async function removerContatoAdicional(contatoId: string): Promise<ActionResult> {
  const supabase = createClient();

  const { error, count } = await supabase
    .from("contatos_adicionais")
    .delete({ count: "exact" })
    .eq("id", contatoId);

  if (error) {
    console.error("Erro ao remover contato adicional:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!count) return { ok: false, erro: ERRO_PERMISSAO };

  revalidatePath("/tutores");
  return { ok: true };
}

// ----------------------------------------------------------------------------
// Assinaturas (Fase 4 — ver supabase/migrations/0003_fase4_assinaturas_agenda.sql)
//
// Criar só faz o insert: trg_assinaturas_primeiro_agendamento (banco) já
// gera o 1º agendamento sozinho, e trg_agendamentos_processar_cobranca já
// gera a cobrança do mês em cima dele — nenhuma lógica de negócio duplicada
// aqui, só o insert.
//
// Pausar/retomar/cancelar é que precisam de mais de um passo, porque essa
// parte NÃO tem trigger cobrindo (o schema só cobre o ciclo automático de
// visita resolvida -> próxima visita, não a mudança manual de status da
// assinatura em si).
// ----------------------------------------------------------------------------

export type AssinaturaInput = {
  tutor_id: string;
  pet_id: string;
  plano_id: string;
  dia_semana_preferencial: number; // 0=domingo..6=sabado
  horario_preferencial: string; // "HH:MM"
  data_inicio: string; // "YYYY-MM-DD"
};

export async function criarAssinatura(
  petshopId: string,
  dados: AssinaturaInput
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
    console.error("Erro ao criar assinatura:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }

  revalidatePath("/tutores");
  revalidatePath("/agenda");
  return { ok: true };
}

// Não desfaz cobrança já gerada (o mês já foi cobrado inteiro na 1ª visita —
// ver comentário de cobrancas em 0001_init.sql) — só impede visita nova de
// ser gerada. 'pronto' fica de fora de propósito: se o pet já está physicamente
// pronto pra busca, pausar a assinatura não deveria cancelar essa entrega em
// andamento — a equipe resolve normalmente e o próximo ciclo é que não nasce
// (porque gerar_proximo_agendamento já checa status='ativa').
export async function pausarAssinatura(assinaturaId: string): Promise<ActionResult> {
  const supabase = createClient();

  const { error: erroAssinatura, count } = await supabase
    .from("assinaturas")
    .update({ status: "pausada" }, { count: "exact" })
    .eq("id", assinaturaId);

  if (erroAssinatura) {
    console.error("Erro ao pausar assinatura:", erroAssinatura);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!count) return { ok: false, erro: ERRO_PERMISSAO };

  const { error: erroAgendamento } = await supabase
    .from("agendamentos")
    .update({ status: "cancelado" })
    .eq("assinatura_id", assinaturaId)
    .in("status", ["agendado", "confirmado", "reagendado"]);

  if (erroAgendamento) {
    console.error("Erro ao cancelar próxima visita ao pausar assinatura:", erroAgendamento);
    // Assinatura já ficou pausada; a visita pendente é que não foi limpa —
    // não desfaço o pause por causa disso, só reporto pra equipe tentar de
    // novo (ela vai ver a visita ainda listada na agenda).
    return { ok: false, erro: "Assinatura pausada, mas não deu pra cancelar a próxima visita já agendada. Cancele ela manualmente na Agenda." };
  }

  revalidatePath("/tutores");
  revalidatePath("/agenda");
  return { ok: true };
}

// Recalcula a próxima data (mesma matemática de dia-da-semana travado do
// trg_assinaturas_primeiro_agendamento em 0001_init.sql — se hoje já for o
// dia preferencial, a próxima visita é hoje) e insere o agendamento na mão,
// porque só existe trigger de INSERT em assinaturas (o primeiro agendamento),
// não de UPDATE reativando uma assinatura pausada.
function proximaDataPreferencial(diaSemanaPreferencial: number, horarioPreferencial: string): Date {
  const agora = new Date();
  const diasAte = (diaSemanaPreferencial - agora.getDay() + 7) % 7;
  const [hora, minuto] = horarioPreferencial.split(":").map(Number);

  const proxima = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + diasAte);
  proxima.setHours(hora, minuto, 0, 0);
  return proxima;
}

// "YYYY-MM-DD" a partir dos componentes LOCAIS do Date — nunca
// .toISOString().slice(0,10), que usa UTC e pode cair no dia errado
// dependendo do horário e do fuso (ex.: BRT à noite vira o dia seguinte em
// UTC). proxima_data_agendamento é uma coluna `date` só pra exibição — o
// timestamp completo do agendamento em si (data_hora) continua sendo
// gerado via toISOString(), que é seguro porque representa um instante,
// não um "dia".
function paraDataLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function retomarAssinatura(assinaturaId: string): Promise<ActionResult> {
  const supabase = createClient();

  const { data: assinatura, error: erroLeitura } = await supabase
    .from("assinaturas")
    .select("petshop_id, dia_semana_preferencial, horario_preferencial")
    .eq("id", assinaturaId)
    .single();

  if (erroLeitura || !assinatura) {
    console.error("Erro ao ler assinatura pra retomar:", erroLeitura);
    return { ok: false, erro: ERRO_GENERICO };
  }

  const proxima = proximaDataPreferencial(
    assinatura.dia_semana_preferencial,
    assinatura.horario_preferencial
  );

  const { error: erroUpdate, count } = await supabase
    .from("assinaturas")
    .update(
      {
        status: "ativa",
        proxima_data_agendamento: paraDataLocal(proxima),
      },
      { count: "exact" }
    )
    .eq("id", assinaturaId);

  if (erroUpdate) {
    console.error("Erro ao retomar assinatura:", erroUpdate);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!count) return { ok: false, erro: ERRO_PERMISSAO };

  // Dispara trg_agendamentos_processar_cobranca (a cobrança do mês, se ainda
  // não tiver sido paga nesse ciclo) do mesmo jeito que qualquer outro
  // agendamento novo.
  const { error: erroAgendamento } = await supabase.from("agendamentos").insert({
    petshop_id: assinatura.petshop_id,
    assinatura_id: assinaturaId,
    data_hora: proxima.toISOString(),
    status: "agendado",
  });

  if (erroAgendamento) {
    console.error("Erro ao gerar próxima visita ao retomar assinatura:", erroAgendamento);
    return { ok: false, erro: "Assinatura reativada, mas não deu pra gerar a próxima visita. Tenta de novo em alguns segundos." };
  }

  revalidatePath("/tutores");
  revalidatePath("/agenda");
  return { ok: true };
}

// Ordem importa (ver nota em 0001_init.sql, seção 10): status da assinatura
// muda ANTES de cancelar o agendamento do ciclo atual. Se fosse ao contrário,
// trg_agendamentos_resolvido ainda veria status='ativa' e geraria uma
// próxima visita órfã antes da assinatura virar 'cancelada'.
export async function cancelarAssinatura(assinaturaId: string): Promise<ActionResult> {
  const supabase = createClient();

  const { error: erroAssinatura, count } = await supabase
    .from("assinaturas")
    .update({ status: "cancelada" }, { count: "exact" })
    .eq("id", assinaturaId);

  if (erroAssinatura) {
    console.error("Erro ao cancelar assinatura:", erroAssinatura);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!count) return { ok: false, erro: ERRO_PERMISSAO };

  const { error: erroAgendamento } = await supabase
    .from("agendamentos")
    .update({ status: "cancelado" })
    .eq("assinatura_id", assinaturaId)
    .in("status", NAO_TERMINAIS);

  if (erroAgendamento) {
    console.error("Erro ao cancelar visita pendente ao cancelar assinatura:", erroAgendamento);
    return { ok: false, erro: "Assinatura cancelada, mas não deu pra cancelar a visita pendente. Cancele ela manualmente na Agenda." };
  }

  revalidatePath("/tutores");
  revalidatePath("/agenda");
  return { ok: true };
}
