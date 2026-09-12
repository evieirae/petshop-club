"use client";

import { useState } from "react";
import type { StatusCobranca } from "@/types/database";
import { superficie, type TomBadge } from "@/lib/ui/styles";

// Fase D do roadmap de identidade visual — distribuição das cobranças do
// período por status, em rosca (part-to-whole "num relance", <=6 fatias na
// prática: StatusCobranca tem 7 valores possíveis, mas isento/estornado
// raramente aparecem no mesmo mês que os outros). Fatias com quantidade 0
// não entram (ver contagemPorStatus em page.tsx).
//
// Cor de cada fatia é a MESMA cor de status usada em badge()/pontoStatus()
// em lib/ui/styles.ts — não uma paleta nova. "Pago" é sempre o mesmo verde
// aqui, na tabela de cobranças e na Agenda.
const TOM_STROKE: Record<TomBadge, string> = {
  neutro: "stroke-ink-500",
  info: "stroke-info-500",
  sucesso: "stroke-success-700",
  atencao: "stroke-cta-700",
  erro: "stroke-danger-500",
  progresso: "stroke-progress-700",
};

// Par de TOM_STROKE pro swatch da legenda — precisa ser uma classe literal
// própria (não `TOM_STROKE[tom].replace(...)`): o Tailwind escaneia o código
// em busca de strings de classe completas, então uma classe montada em
// runtime por substring nunca é gerada no CSS final.
const TOM_BG: Record<TomBadge, string> = {
  neutro: "bg-ink-500",
  info: "bg-info-500",
  sucesso: "bg-success-700",
  atencao: "bg-cta-700",
  erro: "bg-danger-500",
  progresso: "bg-progress-700",
};

const R = 60;
const STROKE = 22;
const CX = 80;
const CY = 80;
const CIRC = 2 * Math.PI * R;
const GAP = 4;

export type FatiaStatus = {
  status: StatusCobranca;
  quantidade: number;
  tom: TomBadge;
  label: string;
};

export function GraficoStatusCobrancas({
  fatias,
  total,
}: {
  fatias: FatiaStatus[];
  total: number;
}) {
  const [ativa, setAtiva] = useState<StatusCobranca | null>(null);

  let acumulado = 0;
  const arcos = fatias.map((fatia) => {
    const fracao = total > 0 ? fatia.quantidade / total : 0;
    const comprimento = fracao * CIRC;
    const offset = CIRC * 0.25 - acumulado; // 0.25 = começa às 12h, não às 3h
    acumulado += comprimento;
    return { ...fatia, comprimento, offset, fracao };
  });

  return (
    <div className={superficie.cardPadded}>
      <p className="text-sm font-medium text-ink-900">Cobranças por status</p>
      <p className="mt-0.5 text-xs text-ink-500">
        Assinatura + avulsa do período, por quantidade — mesma cor da coluna
        Status na tabela abaixo.
      </p>

      {total === 0 ? (
        <p className="mt-6 text-sm text-ink-500">Nenhuma cobrança neste período ainda.</p>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
          <div className="relative shrink-0" style={{ width: 160, height: 160 }}>
            {/* Sem role="img": cada fatia é um <circle> focável com seu
                próprio aria-label — "img" implicaria conteúdo plano, sem
                filho interativo. O título acima já dá o contexto. */}
            <svg viewBox="0 0 160 160" width={160} height={160}>
              {arcos.map((arco) => (
                <circle
                  key={arco.status}
                  cx={CX}
                  cy={CY}
                  r={R}
                  fill="none"
                  strokeWidth={ativa === arco.status ? STROKE + 4 : STROKE}
                  strokeDasharray={`${Math.max(arco.comprimento - GAP, 0)} ${CIRC}`}
                  strokeDashoffset={arco.offset}
                  strokeLinecap="butt"
                  className={`${TOM_STROKE[arco.tom]} transition-[stroke-width] outline-none`}
                  tabIndex={0}
                  onMouseEnter={() => setAtiva(arco.status)}
                  onMouseLeave={() => setAtiva(null)}
                  onFocus={() => setAtiva(arco.status)}
                  onBlur={() => setAtiva(null)}
                  aria-label={`${arco.label}: ${arco.quantidade} cobrança(s), ${Math.round(arco.fracao * 100)}%`}
                />
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-2xl text-ink-900">
                {ativa ? arcos.find((a) => a.status === ativa)?.quantidade : total}
              </span>
              <span className="text-[0.65rem] text-ink-500">
                {ativa ? arcos.find((a) => a.status === ativa)?.label : "cobranças"}
              </span>
            </div>
          </div>

          <ul className="w-full min-w-0 space-y-1.5">
            {arcos.map((arco) => (
              <li
                key={arco.status}
                className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1 text-sm transition-colors ${
                  ativa === arco.status ? "bg-surface-muted" : ""
                }`}
                onMouseEnter={() => setAtiva(arco.status)}
                onMouseLeave={() => setAtiva(null)}
              >
                <span className="flex min-w-0 items-center gap-2 text-ink-700">
                  <span
                    aria-hidden
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${TOM_BG[arco.tom]}`}
                  />
                  <span className="truncate">{arco.label}</span>
                </span>
                <span className="shrink-0 font-mono text-xs text-ink-500">
                  {arco.quantidade} · {Math.round(arco.fracao * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
