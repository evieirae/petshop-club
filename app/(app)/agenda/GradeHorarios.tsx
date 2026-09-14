"use client";

import { tomCores } from "@/lib/ui/styles";
import { formatarDataCurta, nomeDiaSemana } from "@/lib/semana";
import { paraHorario, paraMinutos } from "@/lib/horarios";
import { layoutColunas } from "@/lib/agenda/layoutColunas";
import {
  dataLocalDoISO,
  horarioLocal,
  racaDoPet,
  TOM_STATUS,
  type AgendamentoResolvido,
} from "@/lib/agenda/resolver";

// Fase 3 de docs/plano-calendario-agenda-reui.md — substitui a tabela
// linha-por-horário (SemanaQuadro, agora removida) por uma grade contínua
// posicionada por horário real, no estilo Google Agenda. Reaproveita
// literalmente os mesmos handlers que a tabela usava: clicar num chip
// continua chamando `onSelecionar` (== setSelecionadoId de antes), "+ novo"
// continua abrindo o mesmo formulário no mesmo dia/horário.
//
// Também serve a visão Dia (Fase 6) — é a mesma grade com `dias` de um
// elemento só, sem nenhum código extra.
//
// Altura de cada linha de hora, em pixels — controla a "densidade" da
// grade. 56px/hora dá espaço pra um chip de agendamento de 30min (28px)
// mostrar uma linha de texto legível.
const ALTURA_HORA_PX = 56;
const PX_POR_MINUTO = ALTURA_HORA_PX / 60;

// Alocação de colunas pra agendamentos que se sobrepõem no mesmo dia (seção
// 4 do plano) — a função pura em si vive em lib/agenda/layoutColunas.ts
// desde a Fase 4; aqui só junta o resultado de volta com o
// AgendamentoResolvido de cada evento pra poder renderizar.
type EventoComColuna = {
  resolvido: AgendamentoResolvido;
  inicioMinutos: number;
  coluna: number;
  totalColunas: number;
};

function alocarColunas(
  itensDoDia: AgendamentoResolvido[],
  passoMinutos: number
): EventoComColuna[] {
  const porId = new Map(itensDoDia.map((r) => [r.agendamento.id, r]));
  const inicioPorId = new Map(
    itensDoDia.map((r) => [
      r.agendamento.id,
      paraMinutos(horarioLocal(r.agendamento.data_hora)),
    ])
  );

  const alocacao = layoutColunas(
    itensDoDia.map((r) => ({
      id: r.agendamento.id,
      inicioMinutos: inicioPorId.get(r.agendamento.id)!,
      duracaoMinutos: passoMinutos,
    }))
  );

  return alocacao.map(({ id, coluna, totalColunas }) => ({
    resolvido: porId.get(id)!,
    inicioMinutos: inicioPorId.get(id)!,
    coluna,
    totalColunas,
  }));
}

export function GradeHorarios({
  dias,
  horarios,
  passoMinutos,
  resolvidos,
  hoje,
  selecionadoId,
  onSelecionar,
  onNovo,
}: {
  dias: string[];
  horarios: string[];
  passoMinutos: number;
  resolvidos: AgendamentoResolvido[];
  hoje: string;
  selecionadoId: string | null;
  onSelecionar: (id: string) => void;
  onNovo: (dia: string, horario: string) => void;
}) {
  if (horarios.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-surface-border bg-surface-card p-6 text-center text-sm text-ink-500">
        Nenhum horário no expediente configurado — confira Configurações.
      </div>
    );
  }

  const minutosHorarios = horarios.map(paraMinutos);
  const inicioGradeMin = Math.min(...minutosHorarios);
  const fimGradeMin = Math.max(...minutosHorarios) + passoMinutos;
  const alturaGradePx = (fimGradeMin - inicioGradeMin) * PX_POR_MINUTO;

  const horaInicial = Math.floor(inicioGradeMin / 60);
  const horaFinal = Math.ceil(fimGradeMin / 60);
  const marcasHora = Array.from(
    { length: horaFinal - horaInicial + 1 },
    (_, i) => (horaInicial + i) * 60
  ).filter((min) => min >= inicioGradeMin && min <= fimGradeMin);

  const porDia = new Map<string, AgendamentoResolvido[]>();
  for (const r of resolvidos) {
    const dia = dataLocalDoISO(r.agendamento.data_hora);
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia)!.push(r);
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-surface-border bg-surface-card">
      <div style={{ minWidth: dias.length > 1 ? 760 : 320 }}>
        {/* Cabeçalho: dia da semana + data, mesmo texto de antes. */}
        <div className="flex">
          <div className="w-14 shrink-0 border-b border-r border-surface-border bg-surface-muted" />
          {dias.map((dia) => (
            <div
              key={dia}
              className={`flex-1 border-b border-surface-border p-2 text-center text-sm font-medium ${
                dia === hoje ? "bg-brand-50/60" : "bg-surface-card"
              }`}
            >
              <div className="text-xs font-normal text-ink-500">{nomeDiaSemana(dia)}</div>
              <div className="text-ink-900">{formatarDataCurta(dia)}</div>
            </div>
          ))}
        </div>

        {/* Corpo: eixo de horas + uma coluna por dia, tudo posicionado por
            minuto real em vez de linha fixa por horário. */}
        <div className="flex">
          <div
            className="relative w-14 shrink-0 border-r border-surface-border bg-surface-muted"
            style={{ height: alturaGradePx }}
          >
            {marcasHora.map((min) => (
              <div
                key={min}
                className="absolute right-1 -translate-y-1/2 font-mono text-[10px] text-ink-500"
                style={{ top: (min - inicioGradeMin) * PX_POR_MINUTO }}
              >
                {paraHorario(min)}
              </div>
            ))}
          </div>

          {dias.map((dia) => {
            const itensDoDia = alocarColunas(porDia.get(dia) ?? [], passoMinutos);
            return (
              <div
                key={dia}
                className={`relative flex-1 border-r border-surface-border last:border-r-0 ${
                  dia === hoje ? "bg-brand-50/30" : ""
                }`}
                style={{ height: alturaGradePx }}
              >
                {marcasHora.map((min) => (
                  <div
                    key={min}
                    className="absolute inset-x-0 border-t border-surface-border"
                    style={{ top: (min - inicioGradeMin) * PX_POR_MINUTO }}
                  />
                ))}

                {/* "+ novo" — uma faixa clicável por horário da grade,
                    atrás dos chips (mesmo comportamento de antes: clicar
                    numa célula/horário vazio abre o NovaVisitaForm
                    pré-preenchido). */}
                {horarios.map((horario) => {
                  const min = paraMinutos(horario);
                  return (
                    <button
                      key={`novo-${horario}`}
                      type="button"
                      onClick={() => onNovo(dia, horario)}
                      className="group absolute inset-x-0 z-0 text-center text-[10px] leading-none text-transparent transition-colors hover:bg-brand-50/60 hover:text-brand-700"
                      style={{
                        top: (min - inicioGradeMin) * PX_POR_MINUTO,
                        height: passoMinutos * PX_POR_MINUTO,
                      }}
                    >
                      <span className="sr-only">Novo agendamento às {horario}</span>
                      <span aria-hidden="true">+ novo</span>
                    </button>
                  );
                })}

                {itensDoDia.map(({ resolvido, inicioMinutos, coluna, totalColunas }) => {
                  const top = (inicioMinutos - inicioGradeMin) * PX_POR_MINUTO;
                  const altura = Math.max(passoMinutos * PX_POR_MINUTO - 2, 18);
                  const largura = 100 / totalColunas;
                  const esquerda = coluna * largura;
                  return (
                    <button
                      key={resolvido.agendamento.id}
                      type="button"
                      onClick={() => onSelecionar(resolvido.agendamento.id)}
                      className={`absolute z-10 overflow-hidden truncate rounded px-1.5 py-0.5 text-left text-[11px] leading-tight transition ${
                        tomCores[TOM_STATUS[resolvido.agendamento.status]]
                      } ${
                        selecionadoId === resolvido.agendamento.id
                          ? "ring-2 ring-brand-500 ring-offset-1"
                          : ""
                      }`}
                      style={{
                        top,
                        height: altura,
                        left: `calc(${esquerda}% + 2px)`,
                        width: `calc(${largura}% - 4px)`,
                      }}
                      title={`${resolvido.pet?.nome ?? "Pet removido"} (${racaDoPet(resolvido.pet)}) · ${resolvido.tutor?.nome ?? "Tutor removido"}`}
                    >
                      {resolvido.pet?.nome ?? "Pet removido"}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
