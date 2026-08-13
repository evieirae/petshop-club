// Grade de horários fixos pro agendamento (avulsa, reagendamento, horário
// preferencial de assinatura) — ver supabase/migrations/0004_intervalo_agendamento.sql
// e docs/regras_padrao_petshop.md, seção 1.
//
// Deliberadamente SEM checagem de capacidade/conflito: é só a grade de
// horários válidos dentro do expediente, pra impedir horário quebrado tipo
// 09:07. Mais de um pet pode cair no mesmo horário — isso é MVP de
// propósito (ver nota "Sem checagem de capacidade" em
// supabase/migrations/0001_init.sql, seção 10). Duração por serviço/porte +
// limite de vagas por horário fica pra quando algum petshop parceiro
// precisar de verdade.

export type ExpedientePetshop = {
  hora_abertura: string; // "HH:MM" ou "HH:MM:SS" (como vem do banco)
  hora_fechamento: string;
  hora_inicio_intervalo: string | null;
  hora_fim_intervalo: string | null;
  intervalo_agendamento_minutos: number;
};

function paraMinutos(horario: string): number {
  const [hora, minuto] = horario.split(":").map(Number);
  return hora * 60 + minuto;
}

function paraHorario(minutos: number): string {
  const hora = Math.floor(minutos / 60);
  const minuto = minutos % 60;
  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

/**
 * Gera os horários "HH:MM" dentro do expediente, pulando o intervalo de
 * almoço quando os dois horários (início/fim) estiverem preenchidos.
 * Retorna [] se o expediente estiver incompleto/inconsistente (ex.: fechamento
 * antes da abertura) — quem chama decide como tratar (mensagem, fallback).
 */
export function gerarHorariosDisponiveis(expediente: ExpedientePetshop): string[] {
  const abertura = paraMinutos(expediente.hora_abertura);
  const fechamento = paraMinutos(expediente.hora_fechamento);
  const passo = expediente.intervalo_agendamento_minutos > 0
    ? expediente.intervalo_agendamento_minutos
    : 60;

  if (fechamento <= abertura) return [];

  const inicioIntervalo = expediente.hora_inicio_intervalo
    ? paraMinutos(expediente.hora_inicio_intervalo)
    : null;
  const fimIntervalo = expediente.hora_fim_intervalo
    ? paraMinutos(expediente.hora_fim_intervalo)
    : null;

  const horarios: string[] = [];
  for (let minuto = abertura; minuto < fechamento; minuto += passo) {
    const noIntervalo =
      inicioIntervalo !== null &&
      fimIntervalo !== null &&
      minuto >= inicioIntervalo &&
      minuto < fimIntervalo;
    if (!noIntervalo) horarios.push(paraHorario(minuto));
  }
  return horarios;
}
