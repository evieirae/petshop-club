"use client";

import { alerta, botao } from "@/lib/ui/styles";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { FormaPagamento, Funcionario, Produto, Tutor } from "@/types/database";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/FormField";
import {
  consultarStatusVenda,
  gerarVendaPix,
  registrarVenda,
  type ItemVendaInput,
} from "./actions";

function formatarPreco(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Tela de Vendas (20/ago/2026) — antes era uma aba dentro de Produtos. Virou
// tela própria a pedido do Eduardo: cadastrar o que gera dinheiro (serviço,
// plano, produto) é uma tarefa; cobrar/vender é outra, e é a que acontece
// dezenas de vezes por dia no balcão. Ver app/(app)/catalogo pra outra metade.
export function VendasSection({
  petshopId,
  produtos,
  tutores,
  funcionarios,
  comissaoAtiva,
}: {
  petshopId: string;
  produtos: Produto[];
  tutores: Tutor[];
  funcionarios: Funcionario[];
  comissaoAtiva: boolean;
}) {
  const [vendendo, setVendendo] = useState(false);
  const produtosAtivos = produtos.filter((p) => p.ativo);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-ink-900">Nova venda</h2>
          <p className="mt-1 text-sm text-ink-500">
            Ponto de venda simples — escolha produtos e quantidade, tutor é
            opcional.
          </p>
        </div>
        <button
          type="button"
          disabled={produtosAtivos.length === 0}
          title={
            produtosAtivos.length === 0
              ? "Cadastre pelo menos um produto ativo no Catálogo antes de vender."
              : undefined
          }
          onClick={() => setVendendo((v) => !v)}
          className={botao({ variante: vendendo ? "neutra" : "cta" })}
        >
          {vendendo ? "Cancelar" : "+ Registrar venda"}
        </button>
      </div>

      {vendendo && (
        <div className="mt-4">
          <NovaVendaForm
            petshopId={petshopId}
            produtos={produtosAtivos}
            tutores={tutores}
            funcionarios={funcionarios}
            comissaoAtiva={comissaoAtiva}
            onDone={() => setVendendo(false)}
          />
        </div>
      )}

      {!vendendo && produtosAtivos.length === 0 && (
        <div className="mt-4">
          <EmptyState
            titulo="Nenhum produto ativo pra vender"
            descricao="Cadastre pelo menos um produto no Catálogo antes de registrar uma venda."
          />
        </div>
      )}

      <p className="mt-6 text-xs text-ink-500">
        O histórico de vendas, com o detalhe de cada uma (itens, quantidades,
        vendedor), fica em{" "}
        <Link href="/financeiro" className="font-medium text-brand-700 hover:underline">
          Financeiro
        </Link>
        .
      </p>
    </section>
  );
}

// ----------------------------------------------------------------------------
// Ponto de venda — carrinho simples em memória: escolhe produto + quantidade,
// "+ adicionar" empilha no carrinho, confirmar chama registrarVenda() (que
// no banco é registrar_venda(), validando estoque de tudo antes de gravar).
// ----------------------------------------------------------------------------

type ItemCarrinho = ItemVendaInput & { chave: string };

function NovaVendaForm({
  petshopId,
  produtos,
  tutores,
  funcionarios,
  comissaoAtiva,
  onDone,
}: {
  petshopId: string;
  produtos: Produto[];
  tutores: Tutor[];
  funcionarios: Funcionario[];
  comissaoAtiva: boolean;
  onDone: () => void;
}) {
  const [produtoId, setProdutoId] = useState(produtos[0]?.id ?? "");
  const [quantidade, setQuantidade] = useState("1");
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [tutorId, setTutorId] = useState("");
  // Vendedor (migration 0016): opcional sempre. Quando só existe um
  // funcionário ativo, já vem escolhido — no balcão de um petshop pequeno é
  // quase sempre a mesma pessoa, e obrigar um clique por venda seria atrito
  // sem ganho. Com dois ou mais, começa em branco pra não atribuir comissão
  // pra pessoa errada por descuido.
  const [funcionarioId, setFuncionarioId] = useState(
    funcionarios.length === 1 ? funcionarios[0].id : ""
  );
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>("local");
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");
  const [concluida, setConcluida] = useState(false);

  // Pix pela plataforma (Fase 3b, ver migration 0015_venda_pix.sql): em vez
  // de "confirmar = pronto" como local/cartão, aqui "confirmar" gera um QR
  // Code e a tela espera o pagamento cair — pixData fica preenchido
  // enquanto isso, statusPix acompanha o polling.
  const [pixData, setPixData] = useState<{
    vendaId: string;
    qrCodeBase64: string;
    copiaCola: string;
  } | null>(null);
  const [statusPix, setStatusPix] = useState<"pendente" | "pago" | "cancelada">("pendente");
  const [copiado, setCopiado] = useState(false);

  // Migration 0019 (soft-delete) — tutor desativado não aparece pra
  // escolher numa venda NOVA, mas vendas antigas dele continuam
  // resolvendo o nome normalmente (esse componente não reusa esta lista
  // pra isso — cada venda já grava tutor_id/nome resolvido no histórico).
  const tutoresOrdenados = tutores
    .filter((t) => t.ativo)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  function nomeProduto(id: string): string {
    return produtos.find((p) => p.id === id)?.nome ?? "produto removido";
  }
  function precoProduto(id: string): number {
    return produtos.find((p) => p.id === id)?.preco_venda ?? 0;
  }

  function adicionarAoCarrinho() {
    setErro("");
    const qtd = Number(quantidade);
    if (!produtoId) {
      setErro("Escolha um produto.");
      return;
    }
    if (!Number.isInteger(qtd) || qtd <= 0) {
      setErro("A quantidade precisa ser um número inteiro maior que zero.");
      return;
    }

    setCarrinho((atual) => {
      // Mesmo produto adicionado de novo soma na linha já existente, em vez
      // de duplicar — mais previsível pro balcão conferir o carrinho.
      const existente = atual.find((i) => i.produto_id === produtoId);
      if (existente) {
        return atual.map((i) =>
          i.produto_id === produtoId ? { ...i, quantidade: i.quantidade + qtd } : i
        );
      }
      return [...atual, { chave: `${produtoId}-${atual.length}`, produto_id: produtoId, quantidade: qtd }];
    });
    setQuantidade("1");
  }

  function removerDoCarrinho(produtoIdRemover: string) {
    setCarrinho((atual) => atual.filter((i) => i.produto_id !== produtoIdRemover));
  }

  const total = carrinho.reduce((soma, i) => soma + precoProduto(i.produto_id) * i.quantidade, 0);

  function handleConfirmar() {
    setErro("");
    if (carrinho.length === 0) {
      setErro("Adicione pelo menos um produto ao carrinho.");
      return;
    }

    const itens = carrinho.map(({ produto_id, quantidade: q }) => ({ produto_id, quantidade: q }));

    startTransition(async () => {
      if (formaPagamento === "pix") {
        const resultado = await gerarVendaPix(petshopId, {
          tutor_id: tutorId || null,
          agendamento_id: null,
          funcionario_id: funcionarioId || null,
          itens,
        });
        if (resultado.ok) {
          setStatusPix("pendente");
          setPixData({
            vendaId: resultado.vendaId,
            qrCodeBase64: resultado.qrCodeBase64,
            copiaCola: resultado.copiaCola,
          });
        } else {
          setErro(resultado.erro);
        }
        return;
      }

      const resultado = await registrarVenda(petshopId, {
        tutor_id: tutorId || null,
        agendamento_id: null,
        funcionario_id: funcionarioId || null,
        forma_pagamento: formaPagamento,
        itens,
      });
      if (resultado.ok) {
        setConcluida(true);
      } else {
        setErro(resultado.erro);
      }
    });
  }

  // Polling do status enquanto o QR Pix está na tela — pra quando o
  // webhook do Asaas confirmar o pagamento (registrar_pagamento_gateway,
  // ramo 'venda') a tela perceber sem precisar a equipe ficar recarregando
  // a página. Sem realtime/websocket nesta fase (ver comentário em
  // consultarStatusVenda, app/(app)/produtos/actions.ts).
  useEffect(() => {
    if (!pixData || statusPix !== "pendente") return;

    const intervalo = setInterval(async () => {
      const resultado = await consultarStatusVenda(pixData.vendaId);
      if (resultado?.status === "pago" || resultado?.status === "cancelada") {
        setStatusPix(resultado.status);
      }
    }, 4000);

    return () => clearInterval(intervalo);
  }, [pixData, statusPix]);

  async function verificarAgora() {
    if (!pixData) return;
    const resultado = await consultarStatusVenda(pixData.vendaId);
    if (resultado?.status === "pago" || resultado?.status === "cancelada") {
      setStatusPix(resultado.status);
    }
  }

  async function copiarCodigoPix() {
    if (!pixData) return;
    try {
      await navigator.clipboard.writeText(pixData.copiaCola);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Clipboard API pode falhar (ex.: contexto não-https em teste local)
      // — o campo com o código continua selecionável na mão como fallback.
    }
  }

  if (pixData) {
    if (statusPix === "pago") {
      return (
        <div className="rounded-xl border border-success-100 bg-success-50 px-6 py-8 text-center">
          <p className="font-display text-lg text-ink-900">Pix confirmado!</p>
          <p className="mt-2 text-sm text-ink-700">
            Total: <span className="font-mono">{formatarPreco(total)}</span>. Estoque já
            atualizado.
          </p>
          <button type="button" onClick={onDone} className={`${botao({ tamanho: "sm" })} mt-4`}>
            Fechar
          </button>
        </div>
      );
    }

    if (statusPix === "cancelada") {
      return (
        <div className={alerta("erro", "text-center")}>
          <p className="font-medium">O Pix expirou sem pagamento.</p>
          <p className="mt-1">O estoque não foi mexido — pode tentar de novo quando o cliente estiver pronto.</p>
          <button
            type="button"
            onClick={() => {
              setPixData(null);
              setErro("");
            }}
            className={`${botao({ variante: "neutra", tamanho: "sm" })} mt-3`}
          >
            Gerar novo Pix
          </button>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-5 text-center">
        <p className="font-display text-lg text-ink-900">
          Total: <span className="font-mono">{formatarPreco(total)}</span>
        </p>
        <p className="mt-1 text-sm text-ink-500">Peça pro cliente escanear o QR Code, ou copie o código Pix.</p>

        <img
          src={`data:image/png;base64,${pixData.qrCodeBase64}`}
          alt="QR Code Pix da venda"
          className="mx-auto mt-4 h-56 w-56 rounded-lg border border-surface-border bg-white p-2"
        />

        <div className="mx-auto mt-4 flex max-w-md items-center gap-2">
          <input
            readOnly
            value={pixData.copiaCola}
            className={`${inputClass} font-mono text-xs`}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            onClick={copiarCodigoPix}
            className={botao({ variante: "neutra", tamanho: "sm", className: "whitespace-nowrap" })}
          >
            {copiado ? "Copiado!" : "Copiar"}
          </button>
        </div>

        <div className="mt-5 flex items-center justify-center gap-3">
          <span className="flex items-center gap-2 text-sm text-ink-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-cta-500" aria-hidden="true" />
            Aguardando pagamento…
          </span>
          <button
            type="button"
            onClick={verificarAgora}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            Já paguei, verificar agora
          </button>
        </div>

        <button
          type="button"
          onClick={onDone}
          className={`${botao({ variante: "neutra", tamanho: "sm" })} mt-4`}
        >
          Fechar (a venda continua pendente até o Pix ser pago)
        </button>
      </div>
    );
  }

  if (concluida) {
    return (
      <div className="rounded-xl border border-success-100 bg-success-50 px-6 py-8 text-center">
        <p className="font-display text-lg text-ink-900">Venda registrada!</p>
        <p className="mt-2 text-sm text-ink-700">
          Total: <span className="font-mono">{formatarPreco(total)}</span>. Estoque já
          atualizado.
        </p>
        <button type="button" onClick={onDone} className={`${botao({ tamanho: "sm" })} mt-4`}>
          Fechar
        </button>
      </div>
    );
  }

  if (produtos.length === 0) {
    return (
      <p className={alerta("erro")}>
        Cadastre pelo menos um produto ativo no catálogo antes de registrar uma venda.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 rounded-xl border border-brand-200 bg-brand-50/60 p-5 sm:grid-cols-2">
      <FormField label="Produto" htmlFor="venda_produto">
        <select
          id="venda_produto"
          className={inputClass}
          value={produtoId}
          onChange={(e) => setProdutoId(e.target.value)}
        >
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome} — {formatarPreco(p.preco_venda)} ({p.estoque_atual} em estoque)
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Quantidade" htmlFor="venda_quantidade">
        <div className="flex items-center gap-2">
          <input
            id="venda_quantidade"
            type="number"
            step="1"
            min="1"
            className={inputClass}
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
          />
          <button
            type="button"
            onClick={adicionarAoCarrinho}
            className={botao({ variante: "neutra", tamanho: "sm", className: "whitespace-nowrap" })}
          >
            + Adicionar
          </button>
        </div>
      </FormField>

      <div className="sm:col-span-2">
        {carrinho.length === 0 ? (
          <p className="text-sm text-ink-500">Carrinho vazio — adicione produtos acima.</p>
        ) : (
          <ul className="divide-y divide-surface-border overflow-hidden rounded-lg border border-surface-border bg-surface-card">
            {carrinho.map((item) => (
              <li key={item.produto_id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-ink-900">
                  {item.quantidade}x {nomeProduto(item.produto_id)}
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-ink-500">
                    {formatarPreco(precoProduto(item.produto_id) * item.quantidade)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removerDoCarrinho(item.produto_id)}
                    className="text-xs font-medium text-danger-600 hover:underline"
                  >
                    remover
                  </button>
                </span>
              </li>
            ))}
            <li className="flex items-center justify-between bg-surface-muted px-3 py-2 text-sm font-medium text-ink-900">
              <span>Total</span>
              <span className="font-mono">{formatarPreco(total)}</span>
            </li>
          </ul>
        )}
      </div>

      {funcionarios.length > 0 && (
        <FormField
          label="Vendedor"
          htmlFor="venda_funcionario"
          hint={
            comissaoAtiva
              ? "Quem fez a venda — é o que gera a comissão. Opcional."
              : "Quem fez a venda. Opcional — a comissão está desligada em Configurações, então isso fica só como registro."
          }
        >
          <select
            id="venda_funcionario"
            className={inputClass}
            value={funcionarioId}
            onChange={(e) => setFuncionarioId(e.target.value)}
          >
            <option value="">— sem vendedor —</option>
            {funcionarios.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </FormField>
      )}

      <FormField label="Tutor" htmlFor="venda_tutor" hint="Opcional — venda de balcão não exige cliente cadastrado.">
        <select
          id="venda_tutor"
          className={inputClass}
          value={tutorId}
          onChange={(e) => setTutorId(e.target.value)}
        >
          <option value="">— sem tutor —</option>
          {tutoresOrdenados.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome} · {t.telefone}
            </option>
          ))}
        </select>
      </FormField>
      <FormField
        label="Forma de pagamento"
        htmlFor="venda_forma_pagamento"
        hint="No local = presencial, sem taxa de serviço. Pix gera um QR Code de verdade (Asaas) pro cliente pagar na hora; Cartão por enquanto é só um rótulo — cobrança ainda combinada fora do sistema."
      >
        <select
          id="venda_forma_pagamento"
          className={inputClass}
          value={formaPagamento}
          onChange={(e) => setFormaPagamento(e.target.value as FormaPagamento)}
        >
          <option value="local">No local</option>
          <option value="cartao">Cartão (pela plataforma)</option>
          <option value="pix">Pix (pela plataforma)</option>
        </select>
      </FormField>

      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="button"
          disabled={pending || carrinho.length === 0}
          onClick={handleConfirmar}
          className={botao()}
        >
          {pending
            ? formaPagamento === "pix"
              ? "Gerando Pix…"
              : "Registrando…"
            : formaPagamento === "pix"
              ? `Gerar Pix — ${formatarPreco(total)}`
              : `Confirmar venda — ${formatarPreco(total)}`}
        </button>
        {erro && (
          <p role="alert" className="text-sm text-danger-600">
            {erro}
          </p>
        )}
      </div>
    </div>
  );
}
