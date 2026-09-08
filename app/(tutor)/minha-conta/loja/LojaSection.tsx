"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { alerta, botao, superficie } from "@/lib/ui/styles";
import { reservarProdutos } from "./actions";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Só o que o tutor pode ver de um produto — `custo` fica de fora. */
export type ProdutoVitrine = {
  id: string;
  nome: string;
  categoria: string | null;
  preco_venda: number;
  estoque_atual: number;
  estoque_reservado: number;
};

function disponivel(produto: ProdutoVitrine): number {
  return Math.max(produto.estoque_atual - produto.estoque_reservado, 0);
}

function prazoLegivel(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LojaSection({
  produtos,
  nomePetshop,
}: {
  produtos: ProdutoVitrine[];
  nomePetshop: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [carrinho, setCarrinho] = useState<Record<string, number>>({});
  const [erro, setErro] = useState("");
  const [reservado, setReservado] = useState<{ ate: string } | null>(null);

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, ProdutoVitrine[]>();
    for (const produto of produtos) {
      const chave = produto.categoria?.trim() || "Outros";
      mapa.set(chave, [...(mapa.get(chave) ?? []), produto]);
    }
    return [...mapa.entries()];
  }, [produtos]);

  const itens = useMemo(
    () =>
      Object.entries(carrinho)
        .filter(([, q]) => q > 0)
        .map(([produtoId, quantidade]) => {
          const produto = produtos.find((p) => p.id === produtoId);
          return { produto, quantidade };
        })
        .filter((i): i is { produto: ProdutoVitrine; quantidade: number } => !!i.produto),
    [carrinho, produtos]
  );

  const total = itens.reduce((soma, i) => soma + i.produto.preco_venda * i.quantidade, 0);

  function mudarQuantidade(produto: ProdutoVitrine, delta: number) {
    setErro("");
    setCarrinho((atual) => {
      const nova = (atual[produto.id] ?? 0) + delta;
      const limitada = Math.max(0, Math.min(nova, disponivel(produto)));
      return { ...atual, [produto.id]: limitada };
    });
  }

  function handleReservar() {
    setErro("");
    startTransition(async () => {
      const resultado = await reservarProdutos(
        itens.map((i) => ({ produtoId: i.produto.id, quantidade: i.quantidade }))
      );
      if (resultado.ok) {
        setReservado({ ate: resultado.reservadoAte });
        setCarrinho({});
        router.refresh();
      } else {
        setErro(resultado.erro);
        // O estoque pode ter mudado enquanto a tela estava aberta.
        router.refresh();
      }
    });
  }

  if (reservado) {
    return (
      <div className={`${superficie.cardPadded} text-center`}>
        <ShoppingBag size={28} className="mx-auto text-success-500" aria-hidden="true" />
        <h2 className="mt-3 font-display text-xl text-ink-900">Reservado</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-500">
          O {nomePetshop} já está vendo sua reserva e separou os itens. Você
          paga na hora de retirar.
        </p>
        {reservado.ate && (
          <p className="mt-3 text-sm text-ink-700">
            Guardamos até <strong className="capitalize">{prazoLegivel(reservado.ate)}</strong>.
          </p>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/minha-conta")}
            className={botao()}
          >
            Voltar pra minha conta
          </button>
          <button
            type="button"
            onClick={() => setReservado(null)}
            className={botao({ variante: "neutra" })}
          >
            Reservar mais
          </button>
        </div>
      </div>
    );
  }

  if (produtos.length === 0) {
    return (
      <div className={superficie.vazio}>
        <p className="text-sm text-ink-500">
          O {nomePetshop} ainda não publicou produtos por aqui. Quando publicar,
          dá pra reservar e retirar na loja.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {porCategoria.map(([categoria, lista]) => (
        <section key={categoria}>
          <h2 className="font-display text-lg text-ink-900">{categoria}</h2>
          <div className="mt-3 divide-y divide-surface-border overflow-hidden rounded-xl border border-surface-border bg-surface-card shadow-card">
            {lista.map((produto) => {
              const livre = disponivel(produto);
              const noCarrinho = carrinho[produto.id] ?? 0;

              return (
                <div
                  key={produto.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">{produto.nome}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-500">
                      <span className="font-mono text-ink-900">
                        {MOEDA.format(produto.preco_venda)}
                      </span>
                      {livre === 0 ? (
                        <Badge tom="neutro">Sem estoque</Badge>
                      ) : livre <= 3 ? (
                        <Badge tom="atencao">
                          {livre === 1 ? "Último" : `Só ${livre}`}
                        </Badge>
                      ) : null}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Tirar um ${produto.nome}`}
                      disabled={noCarrinho === 0}
                      onClick={() => mudarQuantidade(produto, -1)}
                      className={botao({ variante: "neutra", tamanho: "sm" })}
                    >
                      <Minus size={14} aria-hidden="true" />
                    </button>
                    <span
                      aria-live="polite"
                      className="w-6 text-center font-mono text-sm text-ink-900"
                    >
                      {noCarrinho}
                    </span>
                    <button
                      type="button"
                      aria-label={`Adicionar um ${produto.nome}`}
                      disabled={livre === 0 || noCarrinho >= livre}
                      onClick={() => mudarQuantidade(produto, 1)}
                      className={botao({ variante: "contorno", tamanho: "sm" })}
                    >
                      <Plus size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {erro && (
        <p role="alert" className={alerta("erro")}>
          {erro}
        </p>
      )}

      {/* Carrinho fixo no rodapé: no celular a lista é longa, e o total ter
          que ser caçado no fim da página é o jeito mais fácil de perder a
          reserva. */}
      {itens.length > 0 && (
        <div className="sticky bottom-4 z-10">
          <div className={`${superficie.cardPadded} shadow-raised`}>
            <ul className="space-y-1 text-sm">
              {itens.map(({ produto, quantidade }) => (
                <li key={produto.id} className="flex justify-between gap-3">
                  <span className="text-ink-700">
                    {quantidade}× {produto.nome}
                  </span>
                  <span className="font-mono text-ink-900">
                    {MOEDA.format(produto.preco_venda * quantidade)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex items-center justify-between border-t border-surface-border pt-3">
              <span className="text-sm font-medium text-ink-900">Total</span>
              <span className="font-mono text-base text-ink-900">
                {MOEDA.format(total)}
              </span>
            </div>

            <p className="mt-2 text-xs text-ink-500">
              Reservar não cobra nada agora — você paga ao retirar no balcão.
            </p>

            <button
              type="button"
              onClick={handleReservar}
              disabled={pending}
              className={`mt-4 ${botao({ tamanho: "lg", largura: "cheia" })}`}
            >
              {pending ? "Reservando…" : "Reservar e retirar na loja"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
