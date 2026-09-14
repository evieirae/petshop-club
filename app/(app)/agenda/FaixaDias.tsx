"use client";

import Link from "next/link";
import { nomeDiaSemana, type Visao } from "@/lib/semana";

// Fase 7 de docs/plano-calendario-agenda-reui.md — abaixo do breakpoint
// mobile (`md:`, ~768px), Semana e Mês colapsam nesta faixa de dias
// horizontal em vez da grade/mês inteiros (mockup mobile aprovado, seção
// 0). É puramente CSS responsivo (`hidden md:block` / `md:hidden` em
// AgendaSection.tsx) — sem detecção de user-agent, sem paradigma de estado
// novo: tocar num dia só navega por <Link>, igual a qualquer outra
// navegação da Agenda.
//
// A visão Dia não usa isto — já é uma coluna só, funciona em qualquer
// largura (seção 7 do plano).
//
// A lista "Visitas de [dia]" que já existe abaixo do quadro (em qualquer
// visão) faz o papel de "lista do dia selecionado" no mobile — não
// duplicada aqui.
export function FaixaDias({
  dias,
  diaSelecionado,
  hoje,
  visao,
  temAgendamento,
}: {
  dias: string[];
  diaSelecionado: string;
  hoje: string;
  visao: Visao;
  temAgendamento: (dia: string) => boolean;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl border border-surface-border bg-surface-card p-2">
      {dias.map((dia) => {
        const numero = Number(dia.slice(8, 10));
        const ativo = dia === diaSelecionado;
        return (
          <Link
            key={dia}
            href={`/agenda?data=${dia}&visao=${visao}`}
            className={`flex shrink-0 flex-1 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-center transition-colors ${
              ativo
                ? "bg-brand-500 text-brand-contrast"
                : dia === hoje
                  ? "bg-brand-50 text-brand-700"
                  : "text-ink-700 hover:bg-surface-muted"
            }`}
          >
            <span className="text-[10px] font-normal opacity-80">{nomeDiaSemana(dia)}</span>
            <span className="text-sm font-medium">{numero}</span>
            <span
              className={`h-1 w-1 rounded-full ${
                temAgendamento(dia) ? (ativo ? "bg-current" : "bg-brand-500") : "bg-transparent"
              }`}
            />
          </Link>
        );
      })}
    </div>
  );
}
