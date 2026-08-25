"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; erro: string };

const ERRO_GENERICO = "Não deu pra marcar como pago. Tenta de novo em alguns segundos.";
const ERRO_PERMISSAO =
  "Nenhuma cobrança foi alterada — confirme se ela ainda existe e se você tem permissão.";

/**
 * "Pagamento no local" (migration 0011) — o balcão confirma que recebeu o
 * dinheiro/cartão próprio na hora, fora do Asaas. Chama a função de banco
 * marcar_pagamento_local(), que faz tudo atomicamente: marca forma_pagamento
 * = 'local', status = 'pago', pago_em = agora, e zera valor_percentual/
 * valor_taxa_gateway (sem comissão da plataforma numa cobrança que ela não
 * processou — mesma lógica de "ganho pela comodidade, não pela obrigação").
 *
 * Funciona tanto pra cobrança de assinatura (banho/tosa por plano) quanto
 * pra visita avulsa — as duas tabelas que a função cobre.
 */
export async function marcarPagamentoLocal(
  origem: "cobranca" | "cobranca_avulsa",
  id: string
): Promise<ActionResult> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("marcar_pagamento_local", {
    p_origem: origem,
    p_id: id,
  });

  if (error) {
    console.error("Erro ao marcar pagamento local:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!data) return { ok: false, erro: ERRO_PERMISSAO };

  revalidatePath("/financeiro");
  revalidatePath("/agenda");
  return { ok: true };
}
