// Resolução de agendamento -> nomes (pet/tutor/serviço/plano) + os mapas de
// status/tom compartilhados. Vivia inteiro dentro de AgendaSection.tsx; virou
// lib compartilhada quando a Visão Geral (app/(app)/VisaoGeralSection.tsx)
// passou a precisar exatamente da mesma leitura pro quadro de visitas do dia
// — mesma "visita resolvida" nas duas telas, sem duplicar a lógica (mesmo
// princípio já seguido no resto do projeto, ver comentário sobre
// criarAssinaturaPelaAgenda em app/(app)/agenda/actions.ts).

import type {
  Agendamento,
  Assinatura,
  CategoriaServico,
  Pet,
  Plano,
  Servico,
  StatusAgendamento,
  Tutor,
} from "@/types/database";
import type { TomBadge } from "@/lib/ui/styles";

export function horarioLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function dataLocalDoISO(iso: string): string {
  // Mesmo formato "YYYY-MM-DD" de paraDataLocal (lib/semana.ts), mas a
  // partir de um ISO com horário — usa os componentes LOCAIS do Date, nunca
  // .toISOString(), pela mesma razão de sempre (UTC desloca o dia à noite
  // no fuso do Brasil).
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatarHorario(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export const TERMINAIS: StatusAgendamento[] = ["entregue", "faltou", "cancelado"];

export const LABEL_STATUS: Record<StatusAgendamento, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  // Migration 0014 — pet chegou, está no banho/tosa agora.
  presente: "Presente",
  pronto: "Pronto p/ busca",
  entregue: "Entregue",
  faltou: "Faltou",
  reagendado: "Reagendado",
  cancelado: "Cancelado",
};

// Os tons saem de lib/ui/styles.ts — o mesmo verde de "confirmado" aqui e de
// "pago" no financeiro. Amarelo = precisa de uma ação do balcão.
export const TOM_STATUS: Record<StatusAgendamento, TomBadge> = {
  agendado: "neutro",
  confirmado: "sucesso",
  presente: "progresso",
  pronto: "info",
  entregue: "sucesso",
  faltou: "erro",
  reagendado: "atencao",
  cancelado: "neutro",
};

// ----------------------------------------------------------------------------
// Fluxo do quadro de visitas do dia (Visão Geral e, opcionalmente, Agenda) —
// migration 0014 (18/ago/2026). Um clique avança exatamente um passo:
// agendado/confirmado/reagendado -> presente -> pronto -> entregue. As duas
// funções abaixo só decidem RÓTULO/HABILITAÇÃO no cliente — a transição de
// verdade (e a limpeza do lembrete pendente ao desfazer) acontece no
// servidor: marcarPresente/marcarPronto/marcarEntregue e
// voltarStatusAgendamento, todas em app/(app)/agenda/actions.ts.
// ----------------------------------------------------------------------------

/** Só os 3 status que este quadro sabe gerar clicando — usado tanto pra
 *  tipar o retorno de proximoStatusQuadro() quanto pra indexar o mapa de
 *  ações correspondente (ver ACAO_POR_PROXIMO_STATUS em
 *  VisitasDoDiaSection.tsx). Mais estreito que StatusAgendamento de
 *  propósito: sem isso, o TypeScript não sabe que o retorno não-nulo nunca é
 *  "agendado"/"faltou"/etc., e a indexação no mapa de ações não compila. */
export type StatusDoQuadro = "presente" | "pronto" | "entregue";

/** null = não avança mais por este quadro (chegou em "entregue", ou é
 *  faltou/cancelado — fora do fluxo, editado só pela Agenda). */
export function proximoStatusQuadro(status: StatusAgendamento): StatusDoQuadro | null {
  switch (status) {
    case "agendado":
    case "confirmado":
    case "reagendado":
      return "presente";
    case "presente":
      return "pronto";
    case "pronto":
      return "entregue";
    default:
      return null;
  }
}

/** true pros status que só existem porque um clique de avanço levou até
 *  eles — únicos que fazem sentido "desfazer". */
export function podeVoltarNoQuadro(status: StatusAgendamento): boolean {
  return status === "presente" || status === "pronto" || status === "entregue";
}

// A raça é o que diferencia dois pets de mesmo nome pra quem olha a agenda
// (ou o quadro do dia, na Visão Geral) e vai receber o animal no balcão. Pet
// cadastrado antes da coluna existir (ou sem raça informada) cai em "raça
// não informada" em vez de sumir — silêncio aqui viraria "esse pet não tem
// raça", que é diferente.
export function racaDoPet(pet: Pet | undefined): string {
  const raca = pet?.raca?.trim();
  return raca && raca.length > 0 ? raca : "raça não informada";
}

export function nomeServico(servico: Servico | undefined, categorias: CategoriaServico[]) {
  if (!servico) return "Serviço removido";
  return (
    servico.nome_customizado?.trim() ||
    categorias.find((c) => c.id === servico.categoria_servico_id)?.nome ||
    "Serviço sem categoria"
  );
}

export type ContextoNomes = {
  tutores: Tutor[];
  pets: Pet[];
  servicos: Servico[];
  categorias: CategoriaServico[];
  planos: Plano[];
  assinaturas: Assinatura[];
};

export type AgendamentoResolvido = {
  agendamento: Agendamento;
  tutor: Tutor | undefined;
  pet: Pet | undefined;
  rotulo: string;
  origem: "assinatura" | "avulsa";
};

export function resolverAgendamento(agendamento: Agendamento, ctx: ContextoNomes): AgendamentoResolvido {
  if (agendamento.assinatura_id) {
    const assinatura = ctx.assinaturas.find((a) => a.id === agendamento.assinatura_id);
    const tutor = ctx.tutores.find((t) => t.id === assinatura?.tutor_id);
    const pet = ctx.pets.find((p) => p.id === assinatura?.pet_id);
    const plano = ctx.planos.find((p) => p.id === assinatura?.plano_id);
    return { agendamento, tutor, pet, rotulo: plano?.nome ?? "Assinatura", origem: "assinatura" };
  }

  const tutor = ctx.tutores.find((t) => t.id === agendamento.tutor_id);
  const pet = ctx.pets.find((p) => p.id === agendamento.pet_id);
  const servico = ctx.servicos.find((s) => s.id === agendamento.servico_id);
  return {
    agendamento,
    tutor,
    pet,
    rotulo: `${nomeServico(servico, ctx.categorias)} (avulso)`,
    origem: "avulsa",
  };
}
