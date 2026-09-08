"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormaPagamento } from "@/types/database";

// ----------------------------------------------------------------------------
// Ações da tela de Vendas. Este arquivo saiu de app/(app)/produtos/actions.ts
// em 20/ago/2026, quando Vendas virou uma tela própria — o que sobrou lá
// (cadastro de produto/estoque) foi pra app/(app)/catalogo/produtos-actions.ts.
//
// Novidade da mesma data: p_funcionario_id (migration 0016). O vendedor é
// opcional — venda sem vendedor marcado simplesmente não gera comissão, e a
// comissão em si é calculada no banco, nunca aqui (o percentual pode ser o
// padrão do petshop ou o override do funcionário, e o valor é congelado na
// venda).
// ----------------------------------------------------------------------------

const ERRO_GENERICO = "Não deu pra salvar. Tenta de novo em alguns segundos.";

export type ItemVendaInput = { produto_id: string; quantidade: number };

export type VendaInput = {
  tutor_id: string | null;
  agendamento_id: string | null;
  funcionario_id: string | null;
  forma_pagamento: FormaPagamento;
  itens: ItemVendaInput[];
};

export type RegistrarVendaResult = { ok: true; vendaId: string } | { ok: false; erro: string };

function revalidarTelasDeVenda() {
  revalidatePath("/vendas");
  revalidatePath("/catalogo");
  revalidatePath("/financeiro");
}

export async function registrarVenda(
  petshopId: string,
  dados: VendaInput
): Promise<RegistrarVendaResult> {
  if (dados.itens.length === 0) {
    return { ok: false, erro: "Escolha pelo menos um produto." };
  }

  const supabase = createClient();

  const { data, error } = await supabase.rpc("registrar_venda", {
    p_petshop_id: petshopId,
    p_tutor_id: dados.tutor_id,
    p_agendamento_id: dados.agendamento_id,
    p_forma_pagamento: dados.forma_pagamento,
    p_itens: dados.itens,
    p_funcionario_id: dados.funcionario_id,
  });

  if (error) {
    console.error("Erro ao registrar venda:", error);
    // registrar_venda() usa RAISE EXCEPTION com mensagem específica pra
    // estoque insuficiente / produto não encontrado / funcionário inválido —
    // mais útil pro balcão do que o erro genérico, então repassamos quando
    // vem do próprio banco.
    if (error.message?.includes("registrar_venda:")) {
      return { ok: false, erro: error.message.replace("registrar_venda: ", "") };
    }
    return { ok: false, erro: ERRO_GENERICO };
  }

  revalidarTelasDeVenda();
  return { ok: true, vendaId: data as string };
}

// ----------------------------------------------------------------------------
// Venda por Pix pela plataforma (Fase 3b — ver migration 0015_venda_pix.sql).
// Diferente de registrarVenda() acima (que grava tudo de uma vez, sempre
// 'pago'), esta é em duas etapas:
//
//   1. criar_venda_pendente_pix() grava a venda 'pendente' + os itens, SEM
//      decrementar estoque (só desconta quando o Pix é confirmado pago).
//   2. Edge Function criar-pix-venda gera a cobrança no Asaas e devolve o
//      QR Code.
//
// O estoque só decrementa depois, quando o webhook do Asaas confirma o
// pagamento (gateway-webhook → registrar_pagamento_gateway, ramo 'venda').
//
// AVISO — RASCUNHO, mesmo status da Fase 6: só funciona de verdade depois
// de ASAAS_API_KEY estar configurada e a Edge Function criar-pix-venda
// estar deployada (ver checklist no fim da migration 0015).
// ----------------------------------------------------------------------------

export type PixVendaInput = {
  tutor_id: string | null;
  agendamento_id: string | null;
  funcionario_id: string | null;
  itens: ItemVendaInput[];
};

export type GerarPixVendaResult =
  | { ok: true; vendaId: string; qrCodeBase64: string; copiaCola: string; expiraEm: string }
  | { ok: false; erro: string };

export async function gerarVendaPix(
  petshopId: string,
  dados: PixVendaInput
): Promise<GerarPixVendaResult> {
  if (dados.itens.length === 0) {
    return { ok: false, erro: "Escolha pelo menos um produto." };
  }

  const supabase = createClient();

  const { data: pendente, error: erroPendente } = await supabase
    .rpc("criar_venda_pendente_pix", {
      p_petshop_id: petshopId,
      p_tutor_id: dados.tutor_id,
      p_agendamento_id: dados.agendamento_id,
      p_itens: dados.itens,
      p_funcionario_id: dados.funcionario_id,
    })
    .single();

  if (erroPendente || !pendente) {
    console.error("Erro ao criar venda pendente (Pix):", erroPendente);
    if (erroPendente?.message?.includes("registrar_venda:")) {
      return { ok: false, erro: erroPendente.message.replace("registrar_venda: ", "") };
    }
    return { ok: false, erro: ERRO_GENERICO };
  }

  const vendaId = (pendente as { venda_id: string }).venda_id;

  const { data: pix, error: erroInvoke } = await supabase.functions.invoke("criar-pix-venda", {
    body: { vendaId, petshopId, tutorId: dados.tutor_id },
  });

  if (erroInvoke) {
    console.error("Erro ao invocar criar-pix-venda:", erroInvoke);
    return { ok: false, erro: "Não deu pra gerar o Pix. Tenta de novo em alguns segundos." };
  }
  if (!pix?.ok) {
    return { ok: false, erro: pix?.erro ?? ERRO_GENERICO };
  }

  revalidarTelasDeVenda();
  return {
    ok: true,
    vendaId,
    qrCodeBase64: pix.qrCodeBase64 as string,
    copiaCola: pix.copiaCola as string,
    expiraEm: pix.expiraEm as string,
  };
}

// Polling simples pra tela saber quando o Pix pendente virou 'pago' (ou
// 'cancelada', se o QR expirar sem pagamento) — chamado a cada poucos
// segundos enquanto o QR Code está na tela. Sem realtime/websocket nesta
// fase: o volume de uma venda de balcão não justifica a complexidade.
export async function consultarStatusVenda(vendaId: string): Promise<{ status: string } | null> {
  const supabase = createClient();
  const { data } = await supabase.from("vendas").select("status").eq("id", vendaId).maybeSingle();
  return data ? { status: data.status as string } : null;
}

// ----------------------------------------------------------------------------
// RESERVAS DA LOJINHA (migration 0026)
//
// As duas usam o client COMUM, não service role: `concluir_reserva()` e
// `cancelar_reserva()` não são SECURITY DEFINER, então rodam com a sessão de
// quem chamou e a RLS de sempre continua valendo — id de reserva de outro
// petshop simplesmente não encontra linha e a função devolve "Reserva não
// encontrada". É o padrão do projeto: a segurança vem da RLS, não de
// checagem manual no TypeScript.
// ----------------------------------------------------------------------------

/** Tutor apareceu e levou: vira venda paga e o estoque sai de verdade. */
export async function concluirReserva(
  vendaId: string,
  formaPagamento: FormaPagamento = "local"
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const supabase = createClient();

  const { error } = await supabase.rpc("concluir_reserva", {
    p_venda_id: vendaId,
    p_forma_pagamento: formaPagamento,
  });

  if (error) {
    console.error("Erro ao concluir reserva:", error);
    return {
      ok: false,
      erro: error.message.includes("nao encontrada")
        ? "Essa reserva já foi resolvida por outra pessoa. Atualize a página."
        : ERRO_GENERICO,
    };
  }

  revalidatePath("/vendas");
  revalidatePath("/financeiro");
  revalidatePath("/catalogo");
  return { ok: true };
}

/** Libera o estoque sem esperar o prazo — desistência ou necessidade da loja. */
export async function cancelarReserva(
  vendaId: string
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const supabase = createClient();

  const { error } = await supabase.rpc("cancelar_reserva", { p_venda_id: vendaId });

  if (error) {
    console.error("Erro ao cancelar reserva:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }

  revalidatePath("/vendas");
  revalidatePath("/catalogo");
  return { ok: true };
}
