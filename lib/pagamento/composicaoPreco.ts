import type { FormaPagamento } from "@/types/database";

export type ComposicaoPreco = {
  taxaPlataforma: number;
  taxaGateway: number;
  valorTotal: number;
};

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Mesma fórmula de calcularComposicaoPreco em
 * supabase/functions/processar-cobrancas/index.ts (decisão de 16/ago/2026,
 * docs/fase6_pagamentos.md, seção 1c) — duplicada lá de propósito porque
 * aquele lado roda em Deno (Edge Function), runtime diferente deste app
 * Next.js. Aqui dentro do Next.js, servidor (Server Component) e cliente
 * (Client Component) compartilham o mesmo bundler, então esta função é uma
 * coisa só nos dois lados.
 *
 * Extraída em 07/set/2026 pra fechar o achado #15/#17 do checklist de
 * segurança: antes, app/(public)/agendar/[tutorId]/page.tsx buscava
 * petshops.percentual_plataforma e mandava o número bruto pro
 * AgendarForm (Client Component), o que expunha a comissão da plataforma
 * no HTML de uma página pública, sem login. Agora quem chama esta função
 * com o percentual é sempre o servidor (page.tsx); o resultado já
 * calculado (composicao) é o que chega no navegador — o percentual em si
 * nunca sai do processo do Next.js.
 */
export function calcularComposicaoPreco(
  valorServico: number,
  percentualPlataforma: number,
  meio: FormaPagamento,
  taxaCartaoPercentual: number,
  taxaCartaoFixo: number
): ComposicaoPreco {
  if (meio === "local") {
    return { taxaPlataforma: 0, taxaGateway: 0, valorTotal: valorServico };
  }

  const taxaPlataforma = arredondar(valorServico * percentualPlataforma);
  const base = valorServico + taxaPlataforma;

  if (meio === "pix") {
    return { taxaPlataforma, taxaGateway: 0, valorTotal: arredondar(base) };
  }

  const valorTotal = arredondar((base + taxaCartaoFixo) / (1 - taxaCartaoPercentual));
  const taxaGateway = arredondar(valorTotal - base);
  return { taxaPlataforma, taxaGateway, valorTotal };
}
