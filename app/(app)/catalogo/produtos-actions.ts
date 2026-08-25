"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; erro: string };

const ERRO_GENERICO = "Não deu pra salvar. Tenta de novo em alguns segundos.";
const ERRO_PERMISSAO =
  "Nenhuma linha foi alterada — confirme se você tem permissão pra editar esse item.";

// ----------------------------------------------------------------------------
// Catálogo de produtos (Fase 3 — ver supabase/migrations/0012_produtos_estoque_vendas.sql).
//
// Este arquivo era app/(app)/produtos/actions.ts até 20/ago/2026, quando
// Catálogo e Vendas viraram telas separadas — as ações de VENDA foram pra
// app/(app)/vendas/actions.ts. Cada revalidatePath abaixo precisa invalidar
// as DUAS telas: o catálogo mostra o produto, a tela de vendas mostra a
// lista de produtos vendáveis e o estoque disponível.
// ----------------------------------------------------------------------------

export type ProdutoInput = {
  nome: string;
  categoria: string | null;
  preco_venda: number;
  custo: number | null;
  estoque_atual: number;
  estoque_minimo: number | null;
};

function revalidarTelasDeProduto() {
  revalidatePath("/catalogo");
  revalidatePath("/vendas");
}

export async function criarProduto(petshopId: string, dados: ProdutoInput): Promise<ActionResult> {
  const supabase = createClient();

  const { error } = await supabase.from("produtos").insert({
    petshop_id: petshopId,
    nome: dados.nome.trim(),
    categoria: dados.categoria?.trim() || null,
    preco_venda: dados.preco_venda,
    custo: dados.custo,
    estoque_atual: dados.estoque_atual,
    estoque_minimo: dados.estoque_minimo,
  });

  if (error) {
    console.error("Erro ao criar produto:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }

  revalidarTelasDeProduto();
  return { ok: true };
}

// estoque_atual é editável aqui de propósito — é o caminho de reposição
// desta fase (ver checklist no fim da migration 0012: não existe uma tela
// de "entrada" dedicada ainda, então corrigir o campo direto é o jeito de
// registrar que chegou mercadoria nova). Isso NÃO gera linha em
// movimentos_estoque — só vendas (via registrar_venda) geram log.
export async function atualizarProduto(produtoId: string, dados: ProdutoInput): Promise<ActionResult> {
  const supabase = createClient();

  const { error, count } = await supabase
    .from("produtos")
    .update(
      {
        nome: dados.nome.trim(),
        categoria: dados.categoria?.trim() || null,
        preco_venda: dados.preco_venda,
        custo: dados.custo,
        estoque_atual: dados.estoque_atual,
        estoque_minimo: dados.estoque_minimo,
      },
      { count: "exact" }
    )
    .eq("id", produtoId);

  if (error) {
    console.error("Erro ao atualizar produto:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!count) return { ok: false, erro: ERRO_PERMISSAO };

  revalidarTelasDeProduto();
  return { ok: true };
}

export async function alternarAtivoProduto(
  produtoId: string,
  ativo: boolean
): Promise<ActionResult> {
  const supabase = createClient();

  const { error, count } = await supabase
    .from("produtos")
    .update({ ativo }, { count: "exact" })
    .eq("id", produtoId);

  if (error) {
    console.error("Erro ao alternar produto ativo/inativo:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!count) return { ok: false, erro: ERRO_PERMISSAO };

  revalidarTelasDeProduto();
  return { ok: true };
}
