"use client";

import { tomCores } from "@/lib/ui/styles";
import { formatarDataCurta, nomeDiaSemana } from "@/lib/semana";
import {
  racaDoPet,
  TOM_STATUS,
  type AgendamentoResolvido,
} from "@/lib/agenda/resolver";

// Extraído de AgendaSection.tsx na Fase 2 de
// docs/plano-calendario-agenda-reui.md — puro refactor preparatório, sem
// nenhuma mudança visual ou de comportamento: recebe os mesmos dados que a
// tabela inline recebia e renderiza pixel a pixel igual. O novo visual
// (grade contínua por horário) entra na Fase 3, trocando só o miolo deste
// componente.
export function SemanaQuadro({
  dias,
  horarios,
  grade,
  hoje,
  selecionadoId,
  onSelecionar,
  onNovo,
}: {
  dias: string[];
  horarios: string[];
  grade: Map<string, Map<string, AgendamentoResolvido[]>>;
  hoje: string;
  selecionadoId: string | null;
  onSelecionar: (id: string) => void;
  onNovo: (dia: string, horario: string) => void;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-surface-border bg-surface-card">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-16 border-b border-r border-surface-border bg-surface-muted p-2" />
            {dias.map((dia) => (
              <th
                key={dia}
                className={`border-b border-surface-border p-2 text-center font-medium ${
                  dia === hoje ? "bg-brand-50/60" : "bg-surface-card"
                }`}
              >
                <div className="text-xs font-normal text-ink-500">{nomeDiaSemana(dia)}</div>
                <div className="text-ink-900">{formatarDataCurta(dia)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {horarios.length === 0 ? (
            <tr>
              <td colSpan={8} className="p-6 text-center text-sm text-ink-500">
                Nenhum horário no expediente configurado — confira Configurações.
              </td>
            </tr>
          ) : (
            horarios.map((horario) => (
              <tr key={horario}>
                <td className="border-b border-r border-surface-border p-2 align-top font-mono text-xs text-ink-500">
                  {horario}
                </td>
                {dias.map((dia) => {
                  const itens = grade.get(dia)?.get(horario) ?? [];
                  return (
                    <td
                      key={dia}
                      className={`border-b border-surface-border p-1 align-top ${
                        dia === hoje ? "bg-brand-50/40" : ""
                      }`}
                    >
                      <div className="flex flex-col gap-1">
                        {itens.map((r) => (
                          <button
                            key={r.agendamento.id}
                            type="button"
                            onClick={() => onSelecionar(r.agendamento.id)}
                            className={`truncate rounded px-1.5 py-1 text-left text-xs transition ${
                              tomCores[TOM_STATUS[r.agendamento.status]]
                            } ${
                              selecionadoId === r.agendamento.id
                                ? "ring-2 ring-brand-500 ring-offset-1"
                                : ""
                            }`}
                            title={`${r.pet?.nome ?? "Pet removido"} (${racaDoPet(r.pet)}) · ${r.tutor?.nome ?? "Tutor removido"}`}
                          >
                            {r.pet?.nome ?? "Pet removido"}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => onNovo(dia, horario)}
                          className="text-left text-[11px] text-ink-500 hover:text-brand-700"
                        >
                          + novo
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
