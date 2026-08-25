"use client";

import { Badge } from "@/components/ui/Badge";
import type { TomBadge } from "@/lib/ui/styles";
import { useState } from "react";
import type { FormaPagamento, StatusVenda } from "@/types/database";

// Detalhe da venda no Financeiro (20/ago/2026, pedido do Eduardo: "quando
// clicarmos nas vendas ter o descritivo da venda no detalhe"). Antes as
// vendas nem apareciam aqui — o Financeiro só listava cobrança de
// assinatura e de visita avulsa, então dinheiro de produto era invisível
// nesta tela.
//
// A linha inteira é um botão: clicar abre/fecha o descritivo logo abaixo,
// sem sair da página e sem modal. É a interação mais barata pra uma lista
// onde a pessoa costuma abrir várias em sequência ("o que tinha nessa venda
// de R$ 240?").

export type ItemVendaDetalhe = {
  id: string;
  produtoNome: string;
  quantidade: number;
  precoUnitario: number;
  subtotal: number;
};

export type LinhaVenda = {
  id: string;
  criadoEm: string;
  tutorNome: string | null;
  vendedorNome: string | null;
  formaPagamento: FormaPagamento;
  status: StatusVenda;
  valorTotal: number;
  valorComissao: number;
  comissaoPercentual: number;
  itens: ItemVendaDetalhe[];
};

const LABEL_FORMA: Record<FormaPagamento, string> = {
  local: "No local",
  cartao: "Cartão",
  pix: "Pix",
};

const LABEL_STATUS_VENDA: Record<StatusVenda, string> = {
  pendente: "Aguardando Pix",
  pago: "Pago",
  cancelada: "Cancelada",
};

const TOM_STATUS_VENDA: Record<StatusVenda, TomBadge> = {
  pendente: "atencao",
  pago: "sucesso",
  cancelada: "erro",
};

function formatarPreco(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function VendasSection({
  vendas,
  comissaoAtiva,
}: {
  vendas: LinhaVenda[];
  comissaoAtiva: boolean;
}) {
  const [abertaId, setAbertaId] = useState<string | null>(null);

  // Só venda paga entra no total — Pix pendente ainda não é dinheiro na
  // conta, e cancelada nunca foi.
  const totalPago = vendas
    .filter((v) => v.status === "pago")
    .reduce((soma, v) => soma + v.valorTotal, 0);

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-ink-900">Vendas de produtos</h2>
          <p className="mt-1 text-sm text-ink-500">
            Clique numa venda pra ver o que foi vendido.
          </p>
        </div>
        <p className="font-mono text-sm text-success-700">
          {formatarPreco(totalPago)} no mês
        </p>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-surface-border bg-surface-card">
        <table className="w-full text-sm">
          <thead className="border-b border-surface-border bg-surface-muted text-left text-xs text-ink-500">
            <tr>
              <th className="px-4 py-3 font-medium">Data</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Vendedor</th>
              <th className="px-4 py-3 font-medium">Itens</th>
              <th className="px-4 py-3 font-medium">Valor</th>
              <th className="px-4 py-3 font-medium">Pagamento</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {vendas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-ink-500">
                  Nenhuma venda de produto neste mês ainda.
                </td>
              </tr>
            )}
            {vendas.map((venda) => {
              const aberta = abertaId === venda.id;
              const qtdItens = venda.itens.reduce((soma, i) => soma + i.quantidade, 0);

              return [
                <tr
                  key={venda.id}
                  onClick={() => setAbertaId(aberta ? null : venda.id)}
                  aria-expanded={aberta}
                  className={`cursor-pointer border-b border-surface-border transition-colors last:border-0 ${
                    aberta ? "bg-brand-50" : "hover:bg-surface-muted"
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-ink-500">
                    {new Date(venda.criadoEm).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-ink-900">{venda.tutorNome ?? "Balcão"}</td>
                  <td className="px-4 py-3 text-ink-500">{venda.vendedorNome ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-500">
                    {qtdItens} {qtdItens === 1 ? "item" : "itens"}
                  </td>
                  <td className="px-4 py-3 font-mono text-success-700">
                    {formatarPreco(venda.valorTotal)}
                  </td>
                  <td className="px-4 py-3 text-ink-500">{LABEL_FORMA[venda.formaPagamento]}</td>
                  <td className="px-4 py-3">
                    <Badge tom={TOM_STATUS_VENDA[venda.status]}>
                      {LABEL_STATUS_VENDA[venda.status]}
                    </Badge>
                  </td>
                </tr>,

                aberta && (
                  <tr key={`${venda.id}-detalhe`} className="border-b border-surface-border last:border-0">
                    <td colSpan={7} className="bg-brand-50/40 px-4 py-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                        Descritivo da venda
                      </p>
                      <ul className="mt-2 divide-y divide-surface-border overflow-hidden rounded-lg border border-surface-border bg-surface-card">
                        {venda.itens.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-center justify-between px-3 py-2 text-sm"
                          >
                            <span className="text-ink-900">
                              {item.quantidade}x {item.produtoNome}
                              <span className="ml-2 text-xs text-ink-500">
                                {formatarPreco(item.precoUnitario)} cada
                              </span>
                            </span>
                            <span className="font-mono text-ink-500">
                              {formatarPreco(item.subtotal)}
                            </span>
                          </li>
                        ))}
                        <li className="flex items-center justify-between bg-surface-muted px-3 py-2 text-sm font-medium text-ink-900">
                          <span>Total</span>
                          <span className="font-mono">{formatarPreco(venda.valorTotal)}</span>
                        </li>
                      </ul>

                      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-500">
                        <span>
                          Horário:{" "}
                          {new Date(venda.criadoEm).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span>Vendedor: {venda.vendedorNome ?? "não informado"}</span>
                        {comissaoAtiva && (
                          <span>
                            Comissão: {formatarPreco(venda.valorComissao)}
                            {venda.comissaoPercentual > 0 && ` (${venda.comissaoPercentual}%)`}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
