"use client";

import { botao } from "@/lib/ui/styles";
import { Badge } from "@/components/ui/Badge";
import { useState, useTransition, type FormEvent } from "react";
import type { Produto } from "@/types/database";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/FormField";
import {
  alternarAtivoProduto,
  atualizarProduto,
  criarProduto,
  type ProdutoInput,
} from "./produtos-actions";

function formatarPreco(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function AtivoBadge({ ativo }: { ativo: boolean }) {
  return <Badge tom={ativo ? "sucesso" : "neutro"}>{ativo ? "Ativo" : "Inativo"}</Badge>;
}

function EstoqueBadge({ produto }: { produto: Produto }) {
  // Amarelo só quando existe um mínimo configurado e o saldo já bateu nele —
  // sem estoque_minimo preenchido, não tem base pra alertar "tá baixo".
  const baixo = produto.estoque_minimo != null && produto.estoque_atual <= produto.estoque_minimo;
  return (
    <Badge tom={produto.estoque_atual === 0 ? "erro" : baixo ? "atencao" : "neutro"}>
      {produto.estoque_atual} em estoque
    </Badge>
  );
}


// Catálogo de produtos — só cadastro/estoque. O ponto de venda saiu daqui
// em 20/ago/2026 (pedido do Eduardo): "cadastro de qualquer coisa que gere
// dinheiro" mora em Catálogo (serviços, planos, produtos), e cobrar/vender
// virou uma tela própria (app/(app)/vendas). Antes as duas coisas dividiam
// a mesma página em abas, o que misturava a tarefa de montar a loja com a
// tarefa do balcão.
export function ProdutosSection({
  petshopId,
  produtos,
}: {
  petshopId: string;
  produtos: Produto[];
}) {
  const [criando, setCriando] = useState(false);
  // Filtros (pedido de 20/ago/2026) — client-side, mesmo padrão do resto
  // do Catálogo/Tutores/Pets. Categoria é texto livre (produtos.categoria),
  // então a lista de opções vem dos valores já cadastrados, não de um
  // lookup fixo.
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("todas");
  const [statusFiltro, setStatusFiltro] = useState<"todos" | "ativos" | "inativos">("todos");
  const [soEstoqueBaixo, setSoEstoqueBaixo] = useState(false);

  const categoriasDisponiveis = Array.from(
    new Set(produtos.map((p) => p.categoria?.trim()).filter((c): c is string => !!c))
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const produtosFiltrados = produtos.filter((produto) => {
    if (categoriaFiltro !== "todas" && (produto.categoria ?? "") !== categoriaFiltro) return false;
    if (statusFiltro === "ativos" && !produto.ativo) return false;
    if (statusFiltro === "inativos" && produto.ativo) return false;
    // Mesma condição de EstoqueBadge — só marca "baixo" quando existe um
    // mínimo configurado pra comparar.
    if (soEstoqueBaixo && !(produto.estoque_minimo != null && produto.estoque_atual <= produto.estoque_minimo)) {
      return false;
    }
    return true;
  });

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-ink-900">Produtos</h2>
          <p className="mt-1 text-sm text-ink-500">
            Nome, preço e estoque de cada produto — reposição é editar o campo
            de estoque direto (sem tela de &quot;entrada&quot; nesta fase).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCriando((v) => !v)}
          className={botao({ variante: criando ? "neutra" : "cta" })}
        >
          {criando ? "Cancelar" : "+ Novo produto"}
        </button>
      </div>

      {criando && (
        <div className="mt-4">
          <ProdutoForm petshopId={petshopId} onDone={() => setCriando(false)} />
        </div>
      )}

      {produtos.length > 0 && (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-surface-border bg-surface-card p-3">
          {categoriasDisponiveis.length > 0 && (
            <div>
              <label htmlFor="produtos_filtro_categoria" className="mb-1 block text-xs font-medium text-ink-500">
                Categoria
              </label>
              <select
                id="produtos_filtro_categoria"
                className={inputClass}
                value={categoriaFiltro}
                onChange={(e) => setCategoriaFiltro(e.target.value)}
              >
                <option value="todas">Todas</option>
                {categoriasDisponiveis.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="produtos_filtro_status" className="mb-1 block text-xs font-medium text-ink-500">
              Status
            </label>
            <select
              id="produtos_filtro_status"
              className={inputClass}
              value={statusFiltro}
              onChange={(e) => setStatusFiltro(e.target.value as "todos" | "ativos" | "inativos")}
            >
              <option value="todos">Todos</option>
              <option value="ativos">Ativos</option>
              <option value="inativos">Inativos</option>
            </select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={soEstoqueBaixo}
              onChange={(e) => setSoEstoqueBaixo(e.target.checked)}
              className="h-4 w-4 rounded border-surface-border text-brand-500 focus:ring-brand-500"
            />
            Só estoque baixo
          </label>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {produtos.length === 0 && !criando ? (
          <EmptyState
            titulo="Nenhum produto cadastrado"
            descricao="Ração, caminha, shampoo, coleira… cadastre aqui pra poder vender no balcão."
          />
        ) : produtosFiltrados.length === 0 ? (
          <EmptyState
            titulo="Nenhum produto encontrado com esse filtro"
            descricao="Ajuste os filtros acima."
          />
        ) : (
          produtosFiltrados.map((produto) => <ProdutoCard key={produto.id} produto={produto} />)
        )}
      </div>
    </section>
  );
}

function ProdutoForm({
  petshopId,
  produto,
  onDone,
}: {
  petshopId: string;
  produto?: Produto;
  onDone: () => void;
}) {
  const [nome, setNome] = useState(produto?.nome ?? "");
  const [categoria, setCategoria] = useState(produto?.categoria ?? "");
  const [precoVenda, setPrecoVenda] = useState(produto ? String(produto.preco_venda) : "");
  const [custo, setCusto] = useState(produto?.custo != null ? String(produto.custo) : "");
  const [estoqueAtual, setEstoqueAtual] = useState(produto ? String(produto.estoque_atual) : "0");
  const [estoqueMinimo, setEstoqueMinimo] = useState(
    produto?.estoque_minimo != null ? String(produto.estoque_minimo) : ""
  );
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");

    const preco = Number(precoVenda);
    const estoque = Number(estoqueAtual);
    if (!nome.trim()) {
      setErro("Dê um nome pro produto.");
      return;
    }
    if (Number.isNaN(preco) || preco < 0) {
      setErro("O preço de venda precisa ser um número maior ou igual a zero.");
      return;
    }
    if (!Number.isInteger(estoque) || estoque < 0) {
      setErro("O estoque precisa ser um número inteiro maior ou igual a zero.");
      return;
    }
    const custoNum = custo.trim() === "" ? null : Number(custo);
    if (custoNum != null && (Number.isNaN(custoNum) || custoNum < 0)) {
      setErro("O custo precisa ser um número maior ou igual a zero (ou deixe em branco).");
      return;
    }
    const estoqueMinimoNum = estoqueMinimo.trim() === "" ? null : Number(estoqueMinimo);
    if (estoqueMinimoNum != null && (!Number.isInteger(estoqueMinimoNum) || estoqueMinimoNum < 0)) {
      setErro("O estoque mínimo precisa ser um número inteiro maior ou igual a zero (ou deixe em branco).");
      return;
    }

    const dados: ProdutoInput = {
      nome: nome.trim(),
      categoria: categoria.trim() || null,
      preco_venda: preco,
      custo: custoNum,
      estoque_atual: estoque,
      estoque_minimo: estoqueMinimoNum,
    };

    startTransition(async () => {
      const resultado = produto
        ? await atualizarProduto(produto.id, dados)
        : await criarProduto(petshopId, dados);
      if (resultado.ok) {
        onDone();
      } else {
        setErro(resultado.erro);
      }
    });
  }

  const prefixo = produto ? `produto_${produto.id}` : "novo_produto";

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-4 rounded-xl border border-brand-200 bg-brand-50/60 p-5 sm:grid-cols-2"
    >
      <FormField label="Nome" htmlFor={`${prefixo}_nome`} full>
        <input
          id={`${prefixo}_nome`}
          className={inputClass}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="ex.: Ração Premium 1kg"
        />
      </FormField>
      <FormField label="Categoria" htmlFor={`${prefixo}_categoria`} hint="Opcional — ex.: ração, higiene, acessórios.">
        <input
          id={`${prefixo}_categoria`}
          className={inputClass}
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
        />
      </FormField>
      <FormField label="Preço de venda" htmlFor={`${prefixo}_preco`}>
        <div className="flex items-center gap-1">
          <span className="text-xs text-ink-500">R$</span>
          <input
            id={`${prefixo}_preco`}
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            className={inputClass}
            value={precoVenda}
            onChange={(e) => setPrecoVenda(e.target.value)}
          />
        </div>
      </FormField>
      <FormField label="Custo" htmlFor={`${prefixo}_custo`} hint="Opcional — só pra você acompanhar margem.">
        <div className="flex items-center gap-1">
          <span className="text-xs text-ink-500">R$</span>
          <input
            id={`${prefixo}_custo`}
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            className={inputClass}
            value={custo}
            onChange={(e) => setCusto(e.target.value)}
          />
        </div>
      </FormField>
      <FormField
        label="Estoque atual"
        htmlFor={`${prefixo}_estoque`}
        hint={produto ? "Editar aqui é como registrar reposição nesta fase." : "Quantas unidades já tem, se for o caso."}
      >
        <input
          id={`${prefixo}_estoque`}
          type="number"
          step="1"
          min="0"
          className={inputClass}
          value={estoqueAtual}
          onChange={(e) => setEstoqueAtual(e.target.value)}
        />
      </FormField>
      <FormField label="Estoque mínimo" htmlFor={`${prefixo}_estoque_minimo`} hint="Opcional — alerta visual quando bater nesse número.">
        <input
          id={`${prefixo}_estoque_minimo`}
          type="number"
          step="1"
          min="0"
          className={inputClass}
          value={estoqueMinimo}
          onChange={(e) => setEstoqueMinimo(e.target.value)}
        />
      </FormField>

      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={botao()}>
          {pending ? "Salvando…" : produto ? "Salvar" : "Adicionar produto"}
        </button>
        {erro && (
          <p role="alert" className="text-sm text-danger-600">
            {erro}
          </p>
        )}
      </div>
    </form>
  );
}

function ProdutoCard({ produto }: { produto: Produto }) {
  const [editando, setEditando] = useState(false);
  const [pending, startTransition] = useTransition();

  if (editando) {
    return (
      <ProdutoForm petshopId={produto.petshop_id} produto={produto} onDone={() => setEditando(false)} />
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface-card p-4">
      <div>
        <div className="flex items-center gap-2">
          <p className="font-medium text-ink-900">{produto.nome}</p>
          <AtivoBadge ativo={produto.ativo} />
          <EstoqueBadge produto={produto} />
        </div>
        <p className="mt-0.5 text-xs text-ink-500">
          {produto.categoria ? `${produto.categoria} · ` : ""}
          {formatarPreco(produto.preco_venda)}
          {produto.custo != null && ` · custo ${formatarPreco(produto.custo)}`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await alternarAtivoProduto(produto.id, !produto.ativo);
            })
          }
          className={botao({ variante: "neutra", tamanho: "sm" })}
        >
          {produto.ativo ? "Desativar" : "Ativar"}
        </button>
        <button
          type="button"
          onClick={() => setEditando(true)}
          className={botao({ variante: "neutra", tamanho: "sm" })}
        >
          Editar
        </button>
      </div>
    </div>
  );
}

