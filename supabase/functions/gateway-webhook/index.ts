// Edge Function (Fase 6): webhook do gateway de pagamento (Asaas).
//
// Mesmo papel que whatsapp-webhook tem na Fase 5: é a ÚNICA fonte da
// verdade sobre se uma cobrança foi paga. O 2xx que processar-cobrancas
// recebe ao criar a cobrança só significa "o gateway aceitou processar" —
// pago/falhou chega depois, assíncrono, por aqui.
//
// AVISO — NUNCA RECEBEU UM WEBHOOK DE VERDADE. A autenticação por header
// `asaas-access-token` e os nomes de evento (PAYMENT_RECEIVED,
// PAYMENT_CONFIRMED, PAYMENT_OVERDUE) seguem a documentação pública
// (docs.asaas.com/docs/sobre-os-webhooks), mas isso só se confirma
// registrando a URL no painel do Asaas depois da fatia 0 e mandando um
// evento de teste.
//
// Autenticação: diferente da Meta (que assina o corpo com HMAC), o Asaas
// manda um token estático configurado na hora de criar o webhook no
// painel — comparação simples, mas ainda em tempo constante (mesmo
// cuidado da Fase 5, o atacante controla o input à vontade numa rota
// pública).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classificarEventoWebhook } from "../_shared/asaas.ts";

const ASAAS_WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? "";

function tokenValido(recebido: string | null): boolean {
  if (!ASAAS_WEBHOOK_TOKEN || !recebido) return false;
  if (recebido.length !== ASAAS_WEBHOOK_TOKEN.length) return false;

  let diff = 0;
  for (let i = 0; i < ASAAS_WEBHOOK_TOKEN.length; i++) {
    diff |= ASAAS_WEBHOOK_TOKEN.charCodeAt(i) ^ recebido.charCodeAt(i);
  }
  return diff === 0;
}

// externalReference que processar-cobrancas manda em toda cobrança é o id
// da própria linha (cobrancas.id / cobrancas_avulsas.id /
// mensalidades_petshop.id) — mas o webhook do Asaas não devolve a origem,
// só o payment.id (gateway_payment_id) e o externalReference. Pra saber
// qual das 3 tabelas atualizar, tenta as três por gateway_payment_id (elas
// são mutuamente exclusivas: um payment.id só existe em uma tabela).
// deno-lint-ignore no-explicit-any
async function resolverOrigem(supabase: any, gatewayPaymentId: string): Promise<"cobranca" | "cobranca_avulsa" | "mensalidade" | null> {
  const [{ data: c }, { data: ca }, { data: m }] = await Promise.all([
    supabase.from("cobrancas").select("id").eq("gateway_payment_id", gatewayPaymentId).maybeSingle(),
    supabase.from("cobrancas_avulsas").select("id").eq("gateway_payment_id", gatewayPaymentId).maybeSingle(),
    supabase.from("mensalidades_petshop").select("id").eq("gateway_payment_id", gatewayPaymentId).maybeSingle(),
  ]);
  if (c) return "cobranca";
  if (ca) return "cobranca_avulsa";
  if (m) return "mensalidade";
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  if (!tokenValido(req.headers.get("asaas-access-token"))) {
    return new Response("unauthorized", { status: 401 });
  }

  // deno-lint-ignore no-explicit-any
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const eventoId: string | undefined = payload?.id; // id do próprio evento (não do payment) — dedupe
  const evento: string | undefined = payload?.event;
  const paymentId: string | undefined = payload?.payment?.id;

  if (!eventoId || !evento || !paymentId) {
    return new Response("payload incompleto", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  // Dedupe: insert com unique(gateway_event_id) — se já existe, o Asaas
  // reentregou o mesmo evento (não respondemos 2xx rápido o bastante da
  // vez anterior, ou é um retry de rede deles). Responder 200 sem
  // reprocessar é o comportamento correto, igual ao whatsapp-webhook.
  const { error: erroInsert } = await supabase.from("eventos_gateway").insert({
    gateway_event_id: eventoId,
    tipo: evento,
    payload,
  });

  if (erroInsert) {
    // 23505 = unique_violation — evento repetido, não é erro de verdade.
    if (erroInsert.code === "23505") {
      return new Response(JSON.stringify({ duplicado: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("Erro ao gravar eventos_gateway:", erroInsert);
    return new Response(JSON.stringify({ erro: erroInsert.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const classificacao = classificarEventoWebhook(evento);
  const origem = await resolverOrigem(supabase, paymentId);

  let aplicado = false;

  if (origem && classificacao === "pago") {
    const { data } = await supabase.rpc("registrar_pagamento_gateway", {
      p_origem: origem,
      p_gateway_payment_id: paymentId,
    });
    aplicado = data === true;
  } else if (origem && classificacao === "falhou") {
    const detalhe = payload?.payment?.description ?? evento;
    const { data } = await supabase.rpc("registrar_falha_pagamento", {
      p_origem: origem,
      p_gateway_payment_id: paymentId,
      p_erro: `Evento ${evento} recebido do gateway: ${detalhe}`,
    });
    aplicado = data === true;
  }
  // classificacao === 'ignorado' (ex.: PAYMENT_DELETED, PAYMENT_UPDATED):
  // fica só o registro em eventos_gateway, sem mudar status — auditoria,
  // não ação.

  await supabase
    .from("eventos_gateway")
    .update({ processado_em: new Date().toISOString() })
    .eq("gateway_event_id", eventoId);

  return new Response(
    JSON.stringify({ origem, classificacao, aplicado }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
