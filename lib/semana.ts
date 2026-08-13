// Matemática de "semana" pra tela de Agenda — usada tanto no Server
// Component (app/(app)/agenda/page.tsx, calcula o range da consulta) quanto
// no Client Component (AgendaSection.tsx, monta as colunas do quadro).
// Semana começa no domingo, mesma convenção de
// `assinaturas.dia_semana_preferencial` (0=domingo..6=sábado).
//
// Tudo em componentes LOCAIS de Date, nunca .toISOString().slice(0,10) —
// ver a mesma cautela documentada em app/(app)/tutores/actions.ts
// (paraDataLocal) sobre UTC deslocar o dia à noite no fuso do Brasil.

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

export const NOMES_DIA_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function nomeDiaSemana(dataISO: string): string {
  return NOMES_DIA_SEMANA[dataLocalDeString(dataISO).getDay()];
}

export function formatarDataCurta(dataISO: string): string {
  const [, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}`;
}
