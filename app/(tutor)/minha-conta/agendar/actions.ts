"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTutorContext } from "@/lib/auth/getTutorContext";
import { gerarHorariosDisponiveis, type ExpedientePetshop } from "@/lib/horarios";

const ERRO_GENERICO = "Não deu pra agendar. Tenta de novo em alguns segundos.";

export type HorarioLivre = { horario: string; livre: boolean };

/**
 * A grade do dia, marcando o que já está ocupado.
 *
 * ESTE É O PONTO SENSÍVEL DE PRIVACIDADE DO PORTAL. O tutor precisa saber
 * que 10h está ocupado sem descobrir QUEM está às 10h. Por isso:
 *
 *  - a leitura dos horários ocupados usa service role e seleciona
 *    UNICAMENTE a coluna `data_hora` — nome de pet, tutor e serviço nunca
 *    saem do banco por esta porta;
 *  - o retorno é `{ horario, livre }`, e nada mais chega no browser.
 *
 * Fazer isso com um select comum filtrado no cliente seria mais simples e
 * estaria errado: os nomes viriam no JSON da resposta, bastando abrir o
 * DevTools pra ler a agenda inteira do petshop.
 *
 * Os status que ocupam são os mesmos do índice agendamentos_slot_unico
 * (0006, ampliado na 0025) — inclusive 'solicitado', porque pedido pendente
 * segura a vaga.
 */
export async function buscarHorariosLivres(data: string): Promise<HorarioLivre[]> {
  const contexto = await getTutorContext();
  if (!contexto || contexto.precisaTrocarSenha) return [];

  const supabase = createClient();

  // Expediente vem pelo client normal, lendo de `petshops_vitrine` (não
  // da tabela base) — migrations 0028/0029, checklist de segurança
  // #15/#17: a policy "vitrine_tutor" em petshops libera a linha inteira
  // (RLS restringe linha, não coluna), então um select explícito aqui não
  // travava um tutor de pedir a linha toda direto pela REST API. A view
  // (security_invoker=true, a policy continua decidindo QUAL linha) só
  // expõe as colunas públicas; horário de funcionamento é informação
  // pública de qualquer forma, mas fee/comissão nunca saem por essa porta.
  const { data: petshop } = await supabase
    .from("petshops_vitrine")
    .select(
      "hora_abertura, hora_fechamento, hora_inicio_intervalo, hora_fim_intervalo, intervalo_agendamento_minutos"
    )
    .eq("id", contexto.petshop.id)
    .maybeSingle();

  if (!petshop) return [];

  const todos = gerarHorariosDisponiveis(petshop as ExpedientePetshop);

  // Brasil não observa horário de verão desde 2019 — offset fixo -03:00,
  // mesma premissa já usada na Fase 5 e na rota pública de agendamento.
  const { data: ocupados } = await createAdminClient()
    .from("agendamentos")
    .select("data_hora")
    .eq("petshop_id", contexto.petshop.id)
    .in("status", ["solicitado", "agendado", "confirmado"])
    .gte("data_hora", `${data}T00:00:00-03:00`)
    .lte("data_hora", `${data}T23:59:59-03:00`);

  const horariosOcupados = new Set(
    (ocupados ?? []).map((a) =>
      new Date(a.data_hora as string).toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      })
    )
  );

  return todos.map((horario) => ({ horario, livre: !horariosOcupados.has(horario) }));
}

export type PedidoInput = {
  petId: string;
  servicoId: string;
  data: string; // "YYYY-MM-DD"
  horario: string; // "HH:MM"
};

export type PedidoResult =
  | { ok: true; status: "agendado" | "solicitado"; valor: number }
  | { ok: false; erro: string };

/**
 * Cria a visita pedida pelo tutor.
 *
 * A regra da 0025, em uma linha: **assinante marca, não-assinante pede.**
 * Quem tem assinatura ativa já paga uma vaga recorrente todo mês — obrigar
 * esse cliente a esperar aprovação pra marcar um banho extra é atrito sem
 * contrapartida. Quem não assina está pedindo venda nova, e o petshop olha
 * a agenda antes de aceitar.
 *
 * Toda a validação acontece aqui, no servidor, e o insert usa service role:
 * a 0024 não deu policy de INSERT pro tutor de propósito, justamente pra
 * que exista UM caminho validado (pet é dele, preço vem da tabela, status
 * decidido pela regra) em vez de um `insert` livre que a tela poderia
 * mentir.
 */
export async function solicitarAgendamento(dados: PedidoInput): Promise<PedidoResult> {
  const contexto = await getTutorContext();

  if (!contexto) {
    return { ok: false, erro: "Sua sessão expirou. Entre de novo pra continuar." };
  }
  if (contexto.precisaTrocarSenha) {
    return { ok: false, erro: "Crie sua senha antes de marcar uma visita." };
  }
  if (!dados.petId || !dados.servicoId || !dados.data || !dados.horario) {
    return { ok: false, erro: "Escolha o pet, o serviço, o dia e o horário." };
  }

  const dataHora = `${dados.data}T${dados.horario}:00-03:00`;
  if (new Date(dataHora).getTime() <= Date.now()) {
    return { ok: false, erro: "Escolha um horário no futuro." };
  }

  const supabaseAdmin = createAdminClient();

  // O pet é mesmo deste tutor? Mesma trava de "id colado por engano" usada
  // na rota pública de agendamento.
  const { data: pet } = await supabaseAdmin
    .from("pets")
    .select("id, porte_id, ativo")
    .eq("id", dados.petId)
    .eq("tutor_id", contexto.tutor.id)
    .maybeSingle();

  if (!pet || pet.ativo === false) {
    return { ok: false, erro: "Pet não encontrado no seu cadastro." };
  }

  // O serviço tem que ser do petshop dele — sem isso, um id de serviço de
  // outro petshop entraria pelo formulário.
  const { data: servico } = await supabaseAdmin
    .from("servicos")
    .select("id")
    .eq("id", dados.servicoId)
    .eq("petshop_id", contexto.petshop.id)
    .eq("ativo", true)
    .maybeSingle();

  if (!servico) {
    return { ok: false, erro: "Esse serviço não está disponível." };
  }

  const { data: preco } = await supabaseAdmin
    .from("precos_servico")
    .select("preco")
    .eq("servico_id", dados.servicoId)
    .eq("porte_id", pet.porte_id)
    .maybeSingle();

  if (!preco) {
    return { ok: false, erro: "Esse serviço não tem preço pro porte do seu pet. Fale com o petshop." };
  }

  const { data: assinaturaAtiva } = await supabaseAdmin
    .from("assinaturas")
    .select("id")
    .eq("tutor_id", contexto.tutor.id)
    .eq("status", "ativa")
    .limit(1)
    .maybeSingle();

  const status = assinaturaAtiva ? "agendado" : "solicitado";

  const { error } = await supabaseAdmin.from("agendamentos").insert({
    petshop_id: contexto.petshop.id,
    tutor_id: contexto.tutor.id,
    pet_id: dados.petId,
    servico_id: dados.servicoId,
    preco_avulso: preco.preco,
    data_hora: dataHora,
    status,
    criado_por: "tutor",
  });

  if (error) {
    // 23505 = agendamentos_slot_unico. Alguém pegou o horário entre a tela
    // carregar a grade e o clique — inclusive um pedido pendente, que
    // desde a 0025 também segura a vaga.
    if (error.code === "23505") {
      return { ok: false, erro: "Esse horário acabou de ser ocupado. Escolha outro, por favor." };
    }
    console.error("Erro ao criar agendamento pelo portal do tutor:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }

  revalidatePath("/minha-conta");
  revalidatePath("/agenda");
  revalidatePath("/painel");

  return { ok: true, status, valor: preco.preco as number };
}
