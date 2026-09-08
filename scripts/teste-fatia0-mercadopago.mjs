#!/usr/bin/env node
/**
 * Fatia 0 — teste de viabilidade do Mercado Pago
 * =============================================================================
 * Responde a UMA pergunta binária que a documentação não responde:
 *
 *     `application_fee` (comissão do marketplace) funciona com pagamento Pix?
 *
 * Ver docs/fatia0-mercadopago.md para o estudo completo. Este script executa
 * o protocolo da seção 7.
 *
 * Não tem dependências: usa só o fetch nativo do Node 18+.
 *
 * -----------------------------------------------------------------------------
 * ANTES DE RODAR
 * -----------------------------------------------------------------------------
 * 1. No painel do MP, crie uma aplicação com modelo de integração
 *    "Marketplace" (Suas integrações > Criar aplicação > Pagamentos online >
 *    Checkout API > Marketplace).
 * 2. Cadastre a Redirect URL da aplicação.
 * 3. Crie duas contas de teste (vendedor e comprador) em "Contas de teste".
 * 4. Na conta do VENDEDOR, cadastre uma chave Pix — sem isso o passo 2 falha
 *    por um motivo que não tem nada a ver com o que estamos testando.
 * 5. Rode o modo `oauth-url`, abra o link logado como o vendedor, autorize, e
 *    troque o `code` por token com o modo `oauth-token`.
 *
 * -----------------------------------------------------------------------------
 * COMO RODAR
 * -----------------------------------------------------------------------------
 *   # 1) gerar a URL de autorização do vendedor
 *   MP_CLIENT_ID=... MP_REDIRECT_URI=... node teste-fatia0-mercadopago.mjs oauth-url
 *
 *   # 2) trocar o code (que volta na redirect) pelo access_token do vendedor
 *   MP_CLIENT_ID=... MP_CLIENT_SECRET=... MP_REDIRECT_URI=... MP_CODE=TG-xxx \
 *     node teste-fatia0-mercadopago.mjs oauth-token
 *
 *   # 3) o teste em si
 *   MP_SELLER_TOKEN=APP_USR-... node teste-fatia0-mercadopago.mjs teste
 *
 *   # 4) depois de PAGAR o Pix, conferir o split de verdade
 *   MP_SELLER_TOKEN=APP_USR-... node teste-fatia0-mercadopago.mjs conferir <payment_id>
 *
 * -----------------------------------------------------------------------------
 * SANDBOX x PRODUÇÃO — leia isto
 * -----------------------------------------------------------------------------
 * No sandbox o Pix fica pendente e não há como pagá-lo de verdade. Sem
 * pagamento aprovado não existe `fee_details`, e é exatamente o `fee_details`
 * que separa "a API aceitou o campo" de "a API fez o split".
 *
 * Portanto: rode os passos 1–4 no sandbox e, se passarem, repita em PRODUÇÃO
 * com MP_VALOR=1.00 e MP_FEE=0.10, entre duas contas suas. Custo do
 * experimento: cerca de um centavo.
 * =============================================================================
 */

const API = "https://api.mercadopago.com";
const AUTH = "https://auth.mercadopago.com";

const env = (k, def) => process.env[k] ?? def;
const VALOR = Number(env("MP_VALOR", "1.00"));
const FEE = Number(env("MP_FEE", "0.10"));
const EMAIL_PAGADOR = env("MP_PAYER_EMAIL", "test_user_pagador@testuser.com");

// ---------------------------------------------------------------------------
// saída
// ---------------------------------------------------------------------------
const cor = (c, s) => `\x1b[${c}m${s}\x1b[0m`;
const ok = (s) => console.log(cor(32, "  OK   ") + s);
const falha = (s) => console.log(cor(31, " FALHA ") + s);
const aviso = (s) => console.log(cor(33, " ATENC ") + s);
const info = (s) => console.log("       " + s);
function titulo(t) {
  console.log("\n" + cor(36, "=".repeat(74)));
  console.log(cor(36, "  " + t));
  console.log(cor(36, "=".repeat(74)));
}

function exigir(...chaves) {
  const faltando = chaves.filter((k) => !process.env[k]);
  if (faltando.length) {
    falha(`Faltam variáveis de ambiente: ${faltando.join(", ")}`);
    process.exit(1);
  }
}

async function chamar(caminho, { metodo = "GET", token, corpo, idem } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (idem) headers["X-Idempotency-Key"] = idem;

  const r = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  let dados;
  const texto = await r.text();
  try { dados = JSON.parse(texto); } catch { dados = { _raw: texto }; }
  return { status: r.status, dados };
}

const uuid = () => crypto.randomUUID();

// ---------------------------------------------------------------------------
// modo: oauth-url
// ---------------------------------------------------------------------------
function oauthUrl() {
  exigir("MP_CLIENT_ID", "MP_REDIRECT_URI");
  const state = uuid();
  const url =
    `${AUTH}/authorization?client_id=${process.env.MP_CLIENT_ID}` +
    `&response_type=code&platform_id=mp&state=${state}` +
    `&redirect_uri=${encodeURIComponent(process.env.MP_REDIRECT_URI)}`;

  titulo("Passo 1 — autorização do vendedor (OAuth)");
  info("Abra este link JÁ LOGADO como a conta do VENDEDOR de teste:");
  console.log("\n" + cor(36, url) + "\n");
  info(`state gerado: ${state}`);
  info("Depois de autorizar, o MP redireciona pra sua Redirect URL com ?code=TG-...");
  info("Copie esse code e rode o modo `oauth-token`.");
  aviso("O code expira em 10 MINUTOS e é de uso único.");
}

// ---------------------------------------------------------------------------
// modo: oauth-token
// ---------------------------------------------------------------------------
async function oauthToken() {
  exigir("MP_CLIENT_ID", "MP_CLIENT_SECRET", "MP_REDIRECT_URI", "MP_CODE");
  titulo("Passo 1b — trocar o code pelo access_token do vendedor");

  const { status, dados } = await chamar("/oauth/token", {
    metodo: "POST",
    corpo: {
      client_id: process.env.MP_CLIENT_ID,
      client_secret: process.env.MP_CLIENT_SECRET,
      code: process.env.MP_CODE,
      grant_type: "authorization_code",
      redirect_uri: process.env.MP_REDIRECT_URI,
    },
  });

  if (status !== 200) {
    falha(`HTTP ${status}`);
    console.log(JSON.stringify(dados, null, 2));
    info("Causas comuns: code expirado (10 min), redirect_uri diferente do");
    info("cadastrado na aplicação, ou client_secret errado.");
    process.exit(1);
  }

  ok("Token obtido.");
  info(`user_id (collector do vendedor): ${dados.user_id}`);
  info(`expires_in: ${dados.expires_in}s (~${Math.round(dados.expires_in / 86400)} dias)`);
  info(`scope: ${dados.scope}`);
  if (!String(dados.scope ?? "").includes("offline_access")) {
    aviso("scope SEM offline_access — você não vai conseguir renovar o token.");
    aviso("Habilite 'offline access' nas permissões da aplicação e refaça.");
  }
  if (!dados.refresh_token) aviso("Não veio refresh_token. Mesmo motivo acima.");

  console.log("\n" + cor(32, "Exporte e siga para o teste:"));
  console.log(`\n  export MP_SELLER_TOKEN='${dados.access_token}'\n`);
  info(`refresh_token (guarde): ${dados.refresh_token ?? "(nenhum)"}`);
}

// ---------------------------------------------------------------------------
// helper: cria pagamento Pix
// ---------------------------------------------------------------------------
async function criarPix({ token, valor, fee, ref }) {
  const corpo = {
    transaction_amount: valor,
    description: `Fatia 0 PetClub — ${ref}`,
    payment_method_id: "pix",
    external_reference: ref,
    payer: { email: EMAIL_PAGADOR },
  };
  if (fee != null) corpo.application_fee = fee;
  return chamar("/v1/payments", { metodo: "POST", token, corpo, idem: uuid() });
}

function erroMP(dados) {
  const c = dados?.cause?.[0];
  return {
    codigo: c?.code ?? dados?.status ?? "?",
    msg: c?.description ?? dados?.message ?? JSON.stringify(dados).slice(0, 200),
  };
}

// ---------------------------------------------------------------------------
// modo: teste
// ---------------------------------------------------------------------------
async function teste() {
  exigir("MP_SELLER_TOKEN");
  const token = process.env.MP_SELLER_TOKEN;

  // -- passo 1: o token é mesmo de OAuth? -----------------------------------
  titulo("Passo 1 — validar o token do vendedor");
  const me = await chamar("/users/me", { token });
  if (me.status !== 200) {
    falha(`/users/me devolveu HTTP ${me.status}. Token inválido ou expirado.`);
    console.log(JSON.stringify(me.dados, null, 2));
    process.exit(1);
  }
  ok(`Token válido — conta ${me.dados.id} (${me.dados.email ?? "sem e-mail"})`);
  info(`live_mode: ${me.dados.site_id ? "site " + me.dados.site_id : "?"}`);
  if (!token.startsWith("APP_USR-")) {
    aviso("O token não começa com APP_USR-. Se não veio do fluxo OAuth, o");
    aviso("passo 3 vai dar erro 2059 e você vai concluir errado.");
  }

  // -- passo 2: Pix SEM application_fee (linha de base) ---------------------
  titulo("Passo 2 — Pix SEM application_fee (prova que Pix funciona nesta conta)");
  const ref1 = `f0-sem-fee-${Date.now()}`;
  const base = await criarPix({ token, valor: VALOR, fee: null, ref: ref1 });

  if (base.status >= 400) {
    const e = erroMP(base.dados);
    falha(`HTTP ${base.status} — código ${e.codigo}: ${e.msg}`);
    info("");
    info("Pix não funciona nem SEM split. Causas prováveis:");
    info("  · a conta do vendedor não tem chave Pix cadastrada");
    info("  · a conta não atingiu o nível KYC exigido");
    info("Resolva isso antes de concluir qualquer coisa sobre application_fee.");
    process.exit(1);
  }
  ok(`Pix criado — id ${base.dados.id}, status ${base.dados.status}`);
  const qr = base.dados?.point_of_interaction?.transaction_data;
  if (qr?.qr_code) {
    ok("QR veio SÍNCRONO na mesma resposta (fecha o gap #3 da Fase 6).");
    info(`copia-e-cola: ${qr.qr_code.slice(0, 60)}...`);
  } else {
    aviso("Resposta sem QR — confira point_of_interaction.transaction_data.");
  }

  // -- passo 3: A PERGUNTA -------------------------------------------------
  titulo("Passo 3 — Pix COM application_fee  ← a pergunta que decide tudo");
  const ref2 = `f0-com-fee-${Date.now()}`;
  const split = await criarPix({ token, valor: VALOR, fee: FEE, ref: ref2 });

  if (split.status >= 400) {
    const e = erroMP(split.dados);
    falha(`HTTP ${split.status} — código ${e.codigo}: ${e.msg}`);
    console.log("\n" + JSON.stringify(split.dados, null, 2));
    info("");
    if (String(e.codigo) === "2059") {
      aviso("Erro 2059. A doc lista UMA causa: token não obtido via OAuth.");
      aviso("Se o passo 1 confirmou que o token é OAuth, então 2059 aqui é");
      aviso("evidência de que o Pix NÃO aceita application_fee — que é a");
      aviso("resposta que procurávamos, e ela mata a troca de gateway.");
    }
    console.log(cor(31, "\n  VEREDITO: application_fee com Pix NÃO funcionou.\n"));
    process.exit(2);
  }

  ok(`Pagamento criado — id ${split.dados.id}, status ${split.dados.status}`);

  // -- passo 4: o campo voltou preenchido? ---------------------------------
  titulo("Passo 4 — o application_fee voltou no response?");
  const feeResp = split.dados.application_fee;
  if (feeResp == null) {
    aviso("O campo application_fee NÃO voltou no response.");
    aviso("Isso é o cenário de falha silenciosa: a API aceitou a chamada e");
    aviso("pode ter descartado a comissão. O passo 6 é obrigatório.");
  } else if (Number(feeResp) !== FEE) {
    aviso(`Voltou com valor diferente: enviado ${FEE}, recebido ${feeResp}.`);
  } else {
    ok(`application_fee = ${feeResp} — aceito e ecoado corretamente.`);
  }

  // -- próximo passo --------------------------------------------------------
  titulo("Próximo passo — pagar e conferir de verdade");
  const qr2 = split.dados?.point_of_interaction?.transaction_data;
  if (qr2?.qr_code) {
    console.log("\nCopia-e-cola do Pix a pagar:\n");
    console.log(cor(36, qr2.qr_code) + "\n");
  }
  aviso("Status 201 NÃO prova que o split aconteceu.");
  info("Pague este Pix e depois rode:");
  console.log(`\n  node teste-fatia0-mercadopago.mjs conferir ${split.dados.id}\n`);
  info("Só o fee_details do pagamento APROVADO responde de verdade.");
}

// ---------------------------------------------------------------------------
// modo: conferir
// ---------------------------------------------------------------------------
async function conferir(paymentId) {
  exigir("MP_SELLER_TOKEN");
  if (!paymentId) { falha("Informe o payment_id."); process.exit(1); }
  const token = process.env.MP_SELLER_TOKEN;

  titulo(`Passos 5 e 6 — pagamento ${paymentId} aprovado?`);
  const { status, dados } = await chamar(`/v1/payments/${paymentId}`, { token });
  if (status !== 200) {
    falha(`HTTP ${status}`);
    console.log(JSON.stringify(dados, null, 2));
    process.exit(1);
  }

  info(`status: ${dados.status} / ${dados.status_detail}`);
  info(`valor: ${dados.transaction_amount}`);
  info(`application_fee no pagamento: ${dados.application_fee ?? "(ausente)"}`);

  if (dados.status !== "approved") {
    aviso("Ainda não aprovado. Pague o Pix e rode de novo.");
    aviso("No sandbox o Pix não é pagável — faça este passo em PRODUÇÃO,");
    aviso("com MP_VALOR=1.00 e MP_FEE=0.10.");
    process.exit(0);
  }
  ok("Pagamento aprovado.");

  titulo("fee_details — a prova final");
  const fees = dados.fee_details ?? [];
  if (!fees.length) {
    falha("fee_details VAZIO.");
    console.log(cor(31, "\n  VEREDITO: a API aceitou o campo mas NÃO fez o split.\n"));
    console.log("  Este é o pior cenário: falha silenciosa. Mercado Pago está fora.\n");
    process.exit(2);
  }

  console.table(fees.map((f) => ({ tipo: f.type, valor: f.amount, quem_paga: f.fee_payer })));

  const temApp = fees.some((f) => String(f.type).includes("application_fee"));
  const temMP = fees.some((f) => String(f.type).includes("mercadopago_fee"));

  if (temMP) ok("Taxa do Mercado Pago presente (esperado).");
  if (temApp) {
    ok("application_fee presente no fee_details.");
    console.log(cor(32, "\n  VEREDITO: o split FUNCIONA com Pix. Projeto viável.\n"));
    info("Confira agora o saldo das duas contas para fechar a validação.");
    info(`Líquido recebido pelo vendedor: ${dados.transaction_details?.net_received_amount ?? "?"}`);
  } else {
    falha("application_fee AUSENTE do fee_details.");
    console.log(cor(31, "\n  VEREDITO: a comissão não foi retida. Mercado Pago está fora.\n"));
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
const [modo, arg] = process.argv.slice(2);
const modos = { "oauth-url": oauthUrl, "oauth-token": oauthToken, teste, conferir: () => conferir(arg) };

if (!modos[modo]) {
  console.log(`
Fatia 0 — teste de viabilidade do Mercado Pago

  node teste-fatia0-mercadopago.mjs oauth-url      gera a URL de autorização
  node teste-fatia0-mercadopago.mjs oauth-token    troca o code por token
  node teste-fatia0-mercadopago.mjs teste          roda os passos 1 a 4
  node teste-fatia0-mercadopago.mjs conferir <id>  passos 5 e 6 (após pagar)

Ver docs/fatia0-mercadopago.md, seção 7.
`);
  process.exit(1);
}

await modos[modo]();
