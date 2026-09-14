// Matemática de "semana" pra tela de Agenda — usada tanto no Server
// Component (app/(app)/agenda/page.tsx, calcula o range da consulta) quanto
// no Client Component (AgendaSection.tsx, monta as colunas do quadro).
// Semana começa no domingo, mesma convenção de
// `assinaturas.dia_semana_preferencial` (0=domingo..6=sábado).
//
// Tudo em componentes LOCAIS de Date, nunca .toISOString().slice(0,10) —
// ver a mesma cautela documentada em app/(app)/tutores/actions.ts
// (paraDataLocal) sobre UTC deslocar o dia à noite no fuso do Brasil.

// Visão do quadro da Agenda (Fase 1 de docs/plano-calendario-agenda-reui.md)
// — vive aqui, não em page.tsx nem em AgendaSection.tsx, porque as duas
// precisam do mesmo tipo: o Server Component pra decidir o range da busca,
// o Client Component pra decidir o que renderizar (grade contínua ou mês).
export type Visao = "mes" | "semana" | "dia";

export function paraDataLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dataLocalDeString(dataISO: string): Date {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

export function adicionarDias(dataISO: string, dias: number): string {
  const d = dataLocalDeString(dataISO);
  d.setDate(d.getDate() + dias);
  return paraDataLocal(d);
}

export function inicioDaSemana(dataISO: string): string {
  const d = dataLocalDeString(dataISO);
  d.setDate(d.getDate() - d.getDay());
  return paraDataLocal(d);
}

export function diasDaSemana(inicioISO: string): string[] {
  return Array.from({ length: 7 }, (_, i) => adicionarDias(inicioISO, i));
}

// Usados pela visão Mês (Fase 1 de docs/plano-calendario-agenda-reui.md) pra
// montar o range de busca — mesma disciplina de Date local, nunca
// toISOString().slice(0,10).
export function inicioDoMes(dataISO: string): string {
  const d = dataLocalDeString(dataISO);
  return paraDataLocal(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function inicioDoMesSeguinte(dataISO: string): string {
  const d = dataLocalDeString(dataISO);
  return paraDataLocal(new Date(d.getFullYear(), d.getMonth() + 1, 1));
}

/** Dia 1 do mês `meses` à frente (negativo = pra trás) — usado pela
 *  navegação "mês anterior/seguinte" da visão Mês (Fase 5). Sempre retorna
 *  o dia 1, então não tem o problema de rollover de "31 de janeiro + 1 mês"
 *  virar março: quem chama só precisa de uma data qualquer dentro do mês
 *  de destino pra `inicioDoMes` calcular o range certo. */
export function adicionarMeses(dataISO: string, meses: number): string {
  const d = dataLocalDeString(dataISO);
  return paraDataLocal(new Date(d.getFullYear(), d.getMonth() + meses, 1));
}

export const NOMES_DIA_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function nomeDiaSemana(dataISO: string): string {
  return NOMES_DIA_SEMANA[dataLocalDeString(dataISO).getDay()];
}

export function formatarDataCurta(dataISO: string): string {
  const [, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}`;
}
