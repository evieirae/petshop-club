// Edge Function (Fase 3b, pedido de 18/ago/2026): gera o QR Code Pix (via
// Asaas) de uma venda de balcão, pra tela de Vendas mostrar direto.
//
// AVISO — MESMO STATUS DE RASCUNHO DA FASE 6 (ver docs/fase6_pagamentos.md
// e supabase/functions/_shared/asaas.ts): a chamada à API do Asaas segue a
// documentação pública, mas nunca foi exercitada contra o sandbox de
// verdade. Antes de confiar nisso contra uma venda real, testar contra o
// sandbox (ver checklist na migration 0015_venda_pix.sql).
//
// Diferente de processar-cobrancas e gateway-webhook (chamados por cron/
// pela internet aberta, sem sessão de usuário — por isso usam
// SUPABASE_SERVICE_ROLE_KEY), esta function é chamada DIRETO pela tela,
// por um usuário autenticado (equipe do petshop logada). Por isso o
// cliente Supabase aqui usa a ANON KEY + o Authorization header que chega
// na requisição (o próprio JWT de quem chamou) — não service role. Isso
// garante que toda leitura/escrita passa pela mesma RLS
// (isolamento_petshop) que protege o resto do app, em vez de precisar
// reimplementar na mão a checagem "esse petshop_id é mesmo do usuário que
// chamou".
//
// Resposta sempre HTTP 200 com { ok: true, ... } ou { ok: false, erro }
// — mesmo padrão de ActionResult usado no resto do app (app/(app)/*/actions.ts)
// — evita side ao servidor Next.js ter que abrir o corpo de um erro HTTP
// não-2xx do supabase.functions.invoke() pra conseguir a mensagem.
//
// Fluxo (ver comentário completo na migration 0015_venda_pix.sql):
//   1. Tela já chamou criar_venda_pendente_pix() e tem um vendaId +
//      valorTotal (venda em status='pendente', estoque ainda não
//      decrementado).
//   2. Esta function resolve o cliente Asaas (tutor com CPF, ou o petshop
//      como pagador-proxy pra venda anônima de balcão — ver
//      garantirClienteTutor/garantirClientePetshop abaixo, duplicadas de
//      processar-cobrancas/index.ts de propósito, mesmo padrão de
//      duplicação já usado no resto do projeto).
//   3. Cria a cobrança Pix no Asaas com externalReference = vendaId,
//      grava vendas.gateway_payment_id, busca o QR Code e devolve pra
//      tela.
//   4. Cliente escaneia e paga → Asaas manda webhook → gateway-webhook
//      chama registrar_pagamento_gateway(origem='venda', …) → SÓ AÍ o
//      estoque decrementa.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type AsaasConfig,
  criarCliente,
  criarCobrancaPix,
  buscarPixQrCode,
  AsaasApiError,
} from "../_shared/asaas.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY") ?? "";
const ASAAS_SANDBOX = (Deno.env.get("ASAAS_SANDBOX") ?? "true") === "true";
const ASAAS_CONFIG: AsaasConfig = { apiKey: ASAAS_API_KEY, sandbox: ASAAS_SANDBOX };

function respostaOk(corpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: true, ...corpo }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function respostaErro(erro: string): Response {
  return new Response(JSON.stringify({ ok: false, erro }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
type Supa = any;

// Duplicada de processar-cobrancas/index.ts de propósito (mesmo padrão de
// pausar_assinatura_por_inadimplencia — funções chamadas por Edge Functions
// diferentes ficam duplicadas em vez de compartilhadas por um módulo extra,
// ver comentário lá). Se o tutor não tiver CPF, devolve null — quem chama
// decide o fallback (garantirClientePetshop).
async function garantirClienteTutor(supabase: Supa, tutorId: string): Promise<string | null> {
  const { data: tutor } = await supabase
    .from("tutores")
    .select("nome, telefone, cpf, gateway_customer_id")
    .eq("id", tutorId)
    .maybeSingle();

  if (!tutor) return null;
  if (tutor.gateway_customer_id) return tutor.gateway_customer_id as string;
  if (!tutor.cpf) return null;

  const cliente = await criarCliente({
    config: ASAAS_CONFIG,
    nome: tutor.nome,
    cpfCnpj: tutor.cpf,
    telefone: tutor.telefone,
    externalReference: tutorId,
  });

  await supabase.from("tutores").update({ gateway_customer_id: cliente.id }).eq("id", tutorId);
  return cliente.id;
}

// Fallback pra venda de balcão sem tutor vinculado (ou tutor sem CPF
// cadastrado) — decisão de 18/ago/2026: em vez de obrigar a equipe a
// digitar o CPF de um cliente anônimo só pra gerar um Pix, usa o próprio
// petshop como "cliente" no Asaas (o mesmo customer já usado pra cobrar o
// fee_fixo_mensal da plataforma dele, ver migration 0006). Funciona porque
// um QR Code Pix não verifica se quem escaneou é o customer cadastrado —
// qualquer pessoa que escaneia paga a cobrança.
async function garantirClientePetshop(supabase: Supa, petshopId: string): Promise<string | null> {
  const { data: petshop } = await supabase
    .from("petshops")
    .select("nome, telefone, cnpj, gateway_customer_id")
    .eq("id", petshopId)
    .maybeSingle();

  if (!petshop) return null;
  if (petshop.gateway_customer_id) return petshop.gateway_customer_id as string;
  if (!petshop.cnpj) return null;

  const cliente = await criarCliente({
    config: ASAAS_CONFIG,
    nome: petshop.nome,
    cpfCnpj: petshop.cnpj,
    telefone: petshop.telefone,
    externalReference: petshopId,
  });

  await supabase.from("petshops").update({ gateway_customer_id: cliente.id }).eq("id", petshopId);
  return cliente.id;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return respostaErro("method not allowed");
  }

  if (!ASAAS_API_KEY) {
    return respostaErro("ASAAS_API_KEY não configurada — veja o checklist na migration 0015_venda_pix.sql.");
  }

  // deno-lint-ignore no-explicit-any
  let corpo: any;
  try {
    corpo = await req.json();
  } catch {
    return respostaErro("invalid json");
  }

  const vendaId: string | undefined = corpo?.vendaId;
  const petshopId: string | undefined = corpo?.petshopId;
  const tutorId: string | null = corpo?.tutorId ?? null;

  if (!vendaId || !petshopId) {
    return respostaErro("vendaId e petshopId são obrigatórios");
  }

  // Age como o usuário que chamou (Authorization repassado), não service
  // role — ver comentário no topo do arquivo.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });

  // Confirma que a venda existe, pertence a esse petshop (RLS já filtra
  // isso sozinha) e ainda está pendente — protege contra clicar "Gerar
  // Pix" duas vezes (dupla cobrança) e contra vendaId de outro petshop.
  const { data: venda, error: erroVenda } = await supabase
    .from("vendas")
    .select("id, valor_total, status, tutor_id, gateway_payment_id")
    .eq("id", vendaId)
    .maybeSingle();

  if (erroVenda || !venda) {
    return respostaErro("Venda não encontrada.");
  }
  if (venda.status !== "pendente") {
    return respostaErro(`Venda já está '${venda.status}' — não dá pra gerar Pix de novo.`);
  }

  try {
    // Prioridade: tutor vinculado (se tiver CPF cadastrado) → petshop como
    // pagador-proxy (venda anônima, ou tutor sem CPF).
    let customerId: string | null = null;
    if (tutorId) {
      customerId = await garantirClienteTutor(supabase, tutorId);
    }
    if (!customerId) {
      customerId = await garantirClientePetshop(supabase, petshopId);
    }
    if (!customerId) {
      return respostaErro(
        "Não deu pra gerar o Pix: nem o tutor (sem CPF cadastrado) nem o petshop (sem CNPJ cadastrado) têm dado suficiente pro Asaas criar o cliente. Cadastre o CNPJ do petshop em Configurações, ou o CPF do tutor em Tutores."
      );
    }

    // Vencimento hoje — é um Pix de balcão, não uma cobrança recorrente;
    // não faz sentido ficar aberto por dias (ver gap de limpeza registrado
    // na migration 0015).
    const hoje = new Date().toISOString().slice(0, 10);

    const cobranca = await criarCobrancaPix({
      config: ASAAS_CONFIG,
      customerId,
      valor: Number(venda.valor_total),
      vencimento: hoje,
      descricao: `Venda #${vendaId.slice(0, 8)} — PetClub`,
      externalReference: vendaId,
    });

    await supabase.from("vendas").update({ gateway_payment_id: cobranca.id }).eq("id", vendaId);

    const qr = await buscarPixQrCode(ASAAS_CONFIG, cobranca.id);

    return respostaOk({
      vendaId,
      gatewayPaymentId: cobranca.id,
      qrCodeBase64: qr.encodedImage,
      copiaCola: qr.payload,
      expiraEm: qr.expirationDate,
    });
  } catch (erro) {
    console.error("Erro ao gerar Pix da venda:", erro);
    const mensagem =
      erro instanceof AsaasApiError ? erro.message : "Não deu pra gerar o Pix. Tenta de novo em alguns segundos.";
    return respostaErro(mensagem);
  }
});
