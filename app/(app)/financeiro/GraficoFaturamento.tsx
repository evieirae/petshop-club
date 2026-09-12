"use client";

import { useState } from "react";
import { formatarDataCurta } from "@/lib/semana";
import { superficie } from "@/lib/ui/styles";

// Fase D do roadmap de identidade visual — gráfico de barras (1 série, cor
// única) do faturamento de serviços pago dia a dia no período selecionado.
// Consome o array de cobranças que a página já busca (nenhuma query nova) —
// ver GraficoFaturamento em app/(app)/financeiro/page.tsx.
//
// Escala em barra, não linha: são pontos discretos por dia, não uma
// tendência contínua. Barra única de cor sólida (brand) em vez de rampa —
// não há ordem/valor codificado na cor, só na altura.

function formatarPreco(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export type PontoFaturamento = { diaISO: string; valor: number };

export function GraficoFaturamento({ pontos }: { pontos: PontoFaturamento[] }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const maiorValor = Math.max(1, ...pontos.map((p) => p.valor));
  const meio = Math.floor((pontos.length - 1) / 2);

  return (
    <div className={superficie.cardPadded}>
      <p className="text-sm font-medium text-ink-900">Faturamento de serviços por dia</p>
      <p className="mt-0.5 text-xs text-ink-500">
        Cobranças de assinatura/avulsa pagas, pelo dia em que caíram na conta
        — vendas de produto têm total próprio abaixo.
      </p>

      <div className="mt-6">
        {/* Sem role="img" aqui: o quadro tem filho focável (uma barra por
            dia, cada uma com seu próprio aria-label) — "img" implica
            conteúdo plano sem filho interativo. O título logo acima já dá o
            contexto pra quem usa leitor de tela. */}
        <div className="flex h-40 items-end gap-0.5">
          {pontos.map((ponto, i) => {
            const alturaPct = (ponto.valor / maiorValor) * 100;
            return (
              <div
                key={ponto.diaISO}
                tabIndex={0}
                className="group relative flex h-full flex-1 min-w-[2px] items-end justify-center outline-none"
                onMouseEnter={() => setAtivo(i)}
                onMouseLeave={() => setAtivo(null)}
                onFocus={() => setAtivo(i)}
                onBlur={() => setAtivo(null)}
                aria-label={`${formatarDataCurta(ponto.diaISO)}: ${formatarPreco(ponto.valor)}`}
              >
                <span
                  className="block w-full rounded-t bg-brand-500 transition-colors group-hover:bg-brand-600 group-focus-visible:bg-brand-600"
                  style={{ height: `${ponto.valor > 0 ? Math.max(alturaPct, 2) : 0}%` }}
                />
                {ativo === i && (
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-surface-border bg-surface-card px-2 py-1 text-xs shadow-raised">
                    <span className="block font-medium text-ink-900">
                      {formatarPreco(ponto.valor)}
                    </span>
                    <span className="block text-ink-500">{formatarDataCurta(ponto.diaISO)}</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {pontos.length > 0 && (
          <div className="mt-2 flex justify-between text-xs text-ink-500">
            <span>{formatarDataCurta(pontos[0].diaISO)}</span>
            {meio > 0 && meio < pontos.length - 1 && (
              <span>{formatarDataCurta(pontos[meio].diaISO)}</span>
            )}
            <span>{formatarDataCurta(pontos[pontos.length - 1].diaISO)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
