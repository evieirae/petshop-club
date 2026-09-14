"use client";

import Link from "next/link";
import { tomCores } from "@/lib/ui/styles";
import { adicionarDias, dataLocalDeString, inicioDaSemana, NOMES_DIA_SEMANA } from "@/lib/semana";
import {
  dataLocalDoISO,
  racaDoPet,
  TOM_STATUS,
  type AgendamentoResolvido,
} from "@/lib/agenda/resolver";

// Fase 5 de docs/plano-calendario-agenda-reui.md — grade de 5-6 semanas
// (sempre 6 aqui, pra manter a altura estável entre meses), com até
// MAX_EVENTOS_POR_CELULA agendamentos + "+N mais". Clicar no número do dia
// navega pra ?data=<dia>&visao=dia (mesmo mecanismo de <Link> que a
// navegação de semana já usa); clicar num evento seleciona
// (`onSelecionar`) sem trocar de visão — mesma regra de sempre (seção 3 do
// plano).
//
// Os dias de fim/início de mês vizinho aparecem esmaecidos só pra grade
// ficar legível — a página só busca agendamentos DENTRO do mês corrente
// (seção 2 do plano), então essas células ficam sempre vazias mesmo que
// exista uma visita lá. Diferença sutil do Google Agenda de verdade,
// documentada e aceita por ora.
const MAX_EVENTOS_POR_CELULA = 3;

export function MesGrade({
  mesReferencia,
  resolvidos,
  hoje,
  diaSelecionado,
  selecionadoId,
  onSelecionar,
}: {
  /** "YYYY-MM-01" — qualquer dia do mês a mostrar, normalizado pro dia 1. */
  mesReferencia: string;
  resolvidos: AgendamentoResolvido[];
  hoje: string;
  diaSelecionado: string;
  selecionadoId: string | null;
  onSelecionar: (id: string) => void;
}) {
  const mesAlvo = dataLocalDeString(mesReferencia).getMonth();
  const primeiroDiaGrade = inicioDaSemana(mesReferencia);
  const dias = Array.from({ length: 42 }, (_, i) => adicionarDias(primeiroDiaGrade, i));

  const porDia = new Map<string, AgendamentoResolvido[]>();
  for (const r of resolvidos) {
    const dia = dataLocalDoISO(r.agendamento.data_hora);
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia)!.push(r);
  }

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      <div className="grid grid-cols-7">
        {NOMES_DIA_SEMANA.map((nome) => (
          <div
            key={nome}
            className="border-b border-r border-surface-border bg-surface-muted p-2 text-center text-xs font-medium text-ink-500 last:border-r-0"
          >
            {nome}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {dias.map((dia) => {
          const dataDia = dataLocalDeString(dia);
          const foraDoMes = dataDia.getMonth() !== mesAlvo;
          const itens = (porDia.get(dia) ?? []).sort((a, b) =>
            a.agendamento.data_hora.localeCompare(b.agendamento.data_hora)
          );
          const visiveis = itens.slice(0, MAX_EVENTOS_POR_CELULA);
          const restantes = itens.length - visiveis.length;

          return (
            <div
              key={dia}
              className={`min-h-[92px] border-b border-r border-surface-border p-1 last:border-r-0 ${
                foraDoMes ? "bg-surface-muted/50" : dia === hoje ? "bg-brand-50/30" : ""
              }`}
            >
              <Link
                href={`/agenda?data=${dia}&visao=dia`}
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                  dia === hoje
                    ? "bg-brand-500 text-brand-contrast"
                    : foraDoMes
                      ? "text-ink-400 hover:bg-surface-card"
                      : "text-ink-900 hover:bg-surface-card"
                } ${
                  dia === diaSelecionado && dia !== hoje ? "ring-2 ring-brand-300" : ""
                }`}
              >
                {dataDia.getDate()}
              </Link>

              <div className="mt-1 flex flex-col gap-0.5">
                {visiveis.map((r) => (
                  <button
                    key={r.agendamento.id}
                    type="button"
                    onClick={() => onSelecionar(r.agendamento.id)}
                    className={`truncate rounded px-1 py-0.5 text-left text-[10px] transition ${
                      tomCores[TOM_STATUS[r.agendamento.status]]
                    } ${selecionadoId === r.agendamento.id ? "ring-1 ring-brand-500" : ""}`}
                    title={`${r.pet?.nome ?? "Pet removido"} (${racaDoPet(r.pet)}) · ${r.tutor?.nome ?? "Tutor removido"}`}
                  >
                    {r.pet?.nome ?? "Pet removido"}
                  </button>
                ))}
                {restantes > 0 && (
                  <span className="px-1 text-[10px] text-ink-500">+{restantes} mais</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
