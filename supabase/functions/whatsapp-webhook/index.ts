// Edge Function (Fase 5): webhook da WhatsApp Cloud API.
//
// Não existia equivalente na versão anterior desta fase, e não é
// firula — com a Meta, o webhook é a única fonte de duas informações que a
// chamada de envio não dá:
//
//   1. STATUS REAL da mensagem (sent → delivered → read, ou failed). O POST
//      de envio responder 2xx só significa "a Meta aceitou"; número
//      inativo/errado falha depois, assincronamente.
//   2. JANELA DE 24H. Texto livre só é permitido depois que o usuário
//      escreve pro número; sem registrar as mensagens recebidas, todo
//      lembrete teria que sair como template pra sempre.
//
// E, de brinde, habilita a confirmação por resposta ("sim") direto na
// conversa, em vez de obrigar o tutor a clicar no link.
//
// Autenticação: a Meta não manda header custom nem JWT — ela assina o corpo
// com HMAC-SHA256 usando o App Secret (X-Hub-Signature-256). Por isso
// verify_jwt=false em supabase/config.toml e a validação de assinatura
// abaixo é obrigatória: essa rota é pública na internet.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const META_APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
const META_WEBHOOK_VERIFY_TOKEN = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") ?? "";

// Respostas que contam como confirmação. Deliberadamente curto e sem
// interpretação livre: "sim, mas às 15h?" NÃO é confirmação de presença no
// horário marcado, e tratar como se fosse seria pior do que ignorar — cai
// no fluxo normal de escalonamento e alguém do petshop lê a mensagem.
const RESPOSTAS_CONFIRMACAO = /^(sim|s|ok|confirmo|confirmado|confirmar|isso|1|👍|✅)[.!]?$/i;

async function assinaturaValida(corpoBruto: string, header: string | null): Promise<boolean> {
  if (!META_APP_SECRET || !header?.startsWith("sha256=")) return false;

  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(META_APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpoBruto));
  const esperado = Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const recebido = header.slice("sha256=".length);
  if (recebido.length !== esperado.length) return false;

  // Comparação em tempo constante — comparar hash com === vaza informação
  // por timing, e aqui o atacante controla o input à vontade.
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) {
    diff |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  }
  return diff === 0;
}

// timestamp da Meta vem em segundos, como string.
function paraIso(timestamp: string | undefined): string {
  const segundos = Number(timestamp);
  if (!Number.isFinite(segundos) || segundos <= 0) return new Date().toISOString();
  return new Date(segundos * 1000).toISOString();
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // --- Verificação do webhook (a Meta chama uma vez, no cadastro da URL) ---
  if (req.method === "GET") {
    const modo = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";

    if (modo === "subscribe" && META_WEBHOOK_VERIFY_TOKEN && token === META_WEBHOOK_VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  // Precisa ser o corpo BRUTO, byte a byte — reserializar o JSON muda o
  // texto e invalida o HMAC.
  const corpoBruto = await req.text();

  if (!(await assinaturaValida(corpoBruto, req.headers.get("x-hub-signature-256")))) {
    return new Response("invalid signature", { status: 401 });
  }

  // deno-lint-ignore no-explicit-any
  let payload: any;
  try {
    payload = JSON.parse(corpoBruto);
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  let statusProcessados = 0;
  let mensagensProcessadas = 0;
  let confirmacoes = 0;

  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {};

      // --- Callbacks de status das mensagens que MANDAMOS ---
      for (const status of value?.statuses ?? []) {
        const detalheErro = status?.errors?.[0]
          ? `${status.errors[0].title ?? "erro"} (code=${status.errors[0].code ?? "?"})${
              status.errors[0].error_data?.details ? " — " + status.errors[0].error_data.details : ""
            }`
          : null;

        await supabase.rpc("registrar_status_mensagem", {
          p_wamid: status?.id,
          p_status: status?.status,
          p_erro: detalheErro,
          p_ocorrido_em: paraIso(status?.timestamp),
        });
        statusProcessados++;
      }

      // --- Mensagens que o usuário mandou PRA GENTE ---
      for (const mensagem of value?.messages ?? []) {
        const telefone: string | undefined = mensagem?.from;
        if (!telefone) continue;

        // Abre/renova a janela de 24h ANTES de qualquer outra coisa — vale
        // pra qualquer tipo de mensagem (texto, áudio, figurinha), porque o
        // que conta pra Meta é o usuário ter escrito, não o conteúdo.
        await supabase.rpc("registrar_mensagem_recebida", {
          p_telefone: telefone,
          p_recebida_em: paraIso(mensagem?.timestamp),
        });
        mensagensProcessadas++;

        // Confirmação por resposta. Cobre texto puro e o clique num botão
        // de resposta rápida, se um dia um template tiver botões.
        const texto: string =
          mensagem?.text?.body ??
          mensagem?.button?.text ??
          mensagem?.interactive?.button_reply?.title ??
          "";

        if (RESPOSTAS_CONFIRMACAO.test(texto.trim())) {
          const { data: agendamentoId } = await supabase.rpc("confirmar_agendamento_por_whatsapp", {
            p_telefone: telefone,
            p_resposta: `Confirmado pelo tutor respondendo "${texto.trim()}" no WhatsApp.`,
          });
          if (agendamentoId) confirmacoes++;
        }
      }
    }
  }

  // A Meta reenvia o evento se não receber 2xx rápido — e reenvio em cima de
  // um erro parcial duplicaria trabalho. As RPCs acima são todas
  // idempotentes (upsert na janela, status monotônico, confirmação só do
  // lembrete ainda não confirmado), então responder 200 sempre é seguro.
  return new Response(
    JSON.stringify({ statusProcessados, mensagensProcessadas, confirmacoes }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
