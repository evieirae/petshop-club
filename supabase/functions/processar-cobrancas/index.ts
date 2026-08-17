// Edge Function (Fase 6 — ver docs/fase6_pagamentos.md, seção 6): drena as
// 3 filas de cobrança pendente (cobrancas, cobrancas_avulsas,
// mensalidades_petshop) e manda pro gateway de pagamento — cartão
// tokenizado quando o tutor tem um salvo, Pix quando não tem (ou quando é
// a preferência dele). Mesmo padrão estrutural de enviar-lembretes/index.ts
// (Fase 5): a lógica de QUANDO uma cobrança nasce vive em SQL puro
// (trigger trg_agendamento_processar_cobranca, gerar_mensalidade_petshop),
// esta function só cuida do I/O com o gateway.
//
// AVISO — NUNCA RODADA CONTRA UM GATEWAY DE VERDADE. Escrita a partir da
// documentação pública do Asaas (ver _shared/asaas.ts), sem sandbox
// disponível ainda (fatia 0 do plano). Antes de agendar isto no pg_cron:
//   1. Rodar a fatia 0 (conta + sandbox + habilitação de tokenização).
//   2. Testar cada branch (cartão OK, cartão recusado, Pix, petshop sem
//      wallet, tutor sem CPF) manualmente contra o sandbox.
//
// O que essa function NÃO faz (de propósito, v1): reconciliação de
// cobranças presas em 'processando'/'aguardando_pagamento' (job separado,
// ver seção 16 do plano) e cobrança de retry — o retry É coberto aqui,
// porque uma cobrança com tentativas<3 e status ainda 'pendente'
// (registrar_falha_pagamento só muda o status na 3ª falha) volta pro
// mesmo SELECT que pega cobrança nova.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type AsaasConfig,
  type SplitConfig,
  criarCliente,
  criarCobrancaCartaoTokenizado,
  criarCobrancaPix,
  buscarPixQrCode,
  AsaasApiError,
} from "../_shared/asaas.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET");
const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY") ?? "";
const ASAAS_SANDBOX = (Deno.env.get("ASAAS_SANDBOX") ?? "true") === "true";

const ASAAS_CONFIG: AsaasConfig = { apiKey: ASAAS_API_KEY, sandbox: ASAAS_SANDBOX };

// Lote pequeno por tabela, mesmo racional de TAMANHO_LOTE em
// enviar-lembretes: suficiente pro volume de teste, recalibrar na Fase 7.
const TAMANHO_LOTE = 20;

// Pix vence em D+3 (seção 6 do plano) — dá tempo do tutor ver o WhatsApp e
// pagar sem seguntar a cobrança em aberto por muito tempo.
const DIAS_VENCIMENTO_PIX = 3;

function dataVencimento(diasAPartirDeHoje: number): string {
  const d = new Date();
  d.setDate(d.getDate() + diasAPartirDeHoje);
  return d.toISOString().slice(0, 10);
}

function formatarPreco(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function descreverErro(err: unknown): string {
  if (err instanceof AsaasApiError) {
    return `${err.message} (http=${err.httpStatus})`;
  }
  return err instanceof Error ? err.message : String(err);
}

// deno-lint-ignore no-explicit-any
type Supa = any;

// ----------------------------------------------------------------------------
// Garante que o tutor/petshop tem um customer no gateway, criando sob
// demanda na 1ª cobrança. Ver comentário de tutores.gateway_customer_id na
// migration 0006 pro porquê disso não estar resolvido desde o cadastro.
// ----------------------------------------------------------------------------
async function garantirClienteTutor(supabase: Supa, tutorId: string): Promise<string | null> {
  const { data: tutor } = await supabase
    .from("tutores")
    .select("nome, telefone, cpf, gateway_customer_id")
    .eq("id", tutorId)
    .maybeSingle();

  if (!tutor) return null;
  if (tutor.gateway_customer_id) return tutor.gateway_customer_id as string;
  if (!tutor.cpf) return null; // sem CPF não dá pra criar customer — quem chama decide como reportar

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

// ----------------------------------------------------------------------------
// Resolve nome do pet + contato de cobrança do tutor, pro lembrete
// cobranca_pix (gap fechado em 17/ago/2026 — ver docs/fase6_pagamentos.md).
// Ramifica avulsa (via agendamento) x assinatura (via assinatura), mesmo
// racional de buscarInfoAgendamento em enviar-lembretes/index.ts.
// ----------------------------------------------------------------------------
async function resolverNomePet(
  supabase: Supa,
  tabela: "cobrancas" | "cobrancas_avulsas",
  linha: { agendamento_id?: string | null; assinatura_id?: string | null }
): Promise<string | null> {
  let petId: string | null = null;

  if (tabela === "cobrancas_avulsas" && linha.agendamento_id) {
    const { data: agendamento } = await supabase
      .from("agendamentos")
      .select("pet_id")
      .eq("id", linha.agendamento_id)
      .maybeSingle();
    petId = agendamento?.pet_id ?? null;
  } else if (tabela === "cobrancas" && linha.assinatura_id) {
    const { data: assinatura } = await supabase
      .from("assinaturas")
      .select("pet_id")
      .eq("id", linha.assinatura_id)
      .maybeSingle();
    petId = assinatura?.pet_id ?? null;
  }

  if (!petId) return null;
  const { data: pet } = await supabase.from("pets").select("nome").eq("id", petId).maybeSingle();
  return pet?.nome ?? null;
}

async function resolverContatoCobranca(
  supabase: Supa,
  tutorId: string
): Promise<{ nome: string; telefone: string } | null> {
  const { data } = await supabase.rpc("resolver_contato", { p_tutor_id: tutorId, p_papel: "cobranca" });
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha?.telefone) return null;
  return { nome: linha.nome ?? "", telefone: linha.telefone };
}

// Gera o lembrete cobranca_pix (fila que enviar-lembretes drena depois) —
// falha aqui NUNCA deve derrubar a cobrança em si, que já está criada no
// gateway nesse ponto; só loga no console (sem coluna própria pra erro de
// lembrete, mesmo padrão de "melhor a cobrança existir sem mensagem do que
// travar por causa da mensagem").
async function gerarLembreteCobrancaPix(
  supabase: Supa,
  tabela: "cobrancas" | "cobrancas_avulsas",
  linha: { agendamento_id?: string | null; assinatura_id?: string | null },
  tutorId: string,
  valorCobrado: number,
  pixCopiaCola: string
): Promise<void> {
  try {
    const [petNome, contato] = await Promise.all([
      resolverNomePet(supabase, tabela, linha),
      resolverContatoCobranca(supabase, tutorId),
    ]);

    if (!contato?.telefone) return; // sem telefone, não há pra quem mandar

    await supabase.from("lembretes").insert({
      tipo: "cobranca_pix",
      destinatario: "tutor",
      papel_destino: "cobranca",
      canal: "whatsapp",
      status: "pendente",
      tutor_id: tutorId,
      agendamento_id: tabela === "cobrancas_avulsas" ? linha.agendamento_id ?? null : null,
      telefone_destino: contato.telefone,
      nome_destino: contato.nome,
      dados_extra: {
        petNome: petNome ?? "",
        valorFormatado: formatarPreco(valorCobrado),
        pixCopiaCola,
      },
    });
  } catch (err) {
    console.error("Falha ao gerar lembrete cobranca_pix:", err);
  }
}

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

// ----------------------------------------------------------------------------
// Composição do preço — decisão de 16/ago/2026 (docs/fase6_pagamentos.md,
// seção 1c): o petshop recebe sempre o valor cheio do serviço
// (valor_total); a receita da plataforma (valor_percentual, já calculada
// pelo trigger) e a taxa do gateway são SOMADAS ao tutor, não descontadas
// do petshop. Pix não tem taxa de gateway (seção 1b — gratuito).
//
// A taxa do cartão incide sobre o valor TOTAL cobrado (é assim que o
// Asaas cobra: um percentual da transação inteira + um fixo), não só
// sobre valor_total do serviço — e o valor total cobrado já inclui essa
// taxa. Pra não ficar circular (taxa depende do total, total depende da
// taxa), a conta é resolvida por "gross-up":
//
//   base = valor_total (serviço) + valor_percentual (taxa da plataforma)
//   valor_cobrado = (base + taxa_fixa_gateway) / (1 - taxa_percentual_gateway)
//   taxa_gateway  = valor_cobrado - base
//
// Confere: valor_cobrado * taxa_percentual_gateway + taxa_fixa_gateway =
// taxa_gateway, exatamente o que o Asaas desconta na liquidação — sobra
// sempre `base` líquido, e o `fixedValue = valor_total` do split (ver
// SplitConfig em _shared/asaas.ts) fica garantido.
//
// Taxa do cartão é ENV VAR, nunca hardcoded — a promocional (1,99% +
// R$0,49) vale só até 16/11/2026, depois volta pra 2,99% + R$0,49 (seção
// 1b do plano). Atualizar ASAAS_TAXA_CARTAO_PERCENTUAL/_FIXO nessa data.
// ----------------------------------------------------------------------------
const ASAAS_TAXA_CARTAO_PERCENTUAL = Number(Deno.env.get("ASAAS_TAXA_CARTAO_PERCENTUAL") ?? "0.0199");
const ASAAS_TAXA_CARTAO_FIXO = Number(Deno.env.get("ASAAS_TAXA_CARTAO_FIXO") ?? "0.49");

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function calcularComposicaoPreco(
  valorServico: number,
  taxaPlataforma: number,
  meio: "cartao" | "pix"
): { taxaGateway: number; valorCobrado: number } {
  const base = valorServico + taxaPlataforma;

  if (meio === "pix") {
    return { taxaGateway: 0, valorCobrado: arredondar(base) };
  }

  const valorCobrado = arredondar((base + ASAAS_TAXA_CARTAO_FIXO) / (1 - ASAAS_TAXA_CARTAO_PERCENTUAL));
  const taxaGateway = arredondar(valorCobrado - base);
  return { taxaGateway, valorCobrado };
}

// ----------------------------------------------------------------------------
// Processa 1 cobrança de tutor (cobranca de assinatura OU cobranca_avulsa —
// mesma lógica, só muda a tabela). petshopId/percentualPlataforma/
// walletId vêm de fora porque quem chama já resolveu isso (assinatura ou
// avulsa chegam no petshop_id de formas diferentes).
// ----------------------------------------------------------------------------
async function processarCobrancaTutor(
  supabase: Supa,
  tabela: "cobrancas" | "cobrancas_avulsas",
  linha: {
    id: string;
    petshop_id: string;
    tutor_id: string | null;
    assinatura_id?: string | null;
    agendamento_id?: string | null;
    valor_total: number;
    valor_petshop: number;
    valor_percentual: number;
  }
): Promise<void> {
  // cobrancas não tem tutor_id direto — vem via assinatura.
  let tutorId = linha.tutor_id;
  if (!tutorId && linha.assinatura_id) {
    const { data: assinatura } = await supabase
      .from("assinaturas")
      .select("tutor_id")
      .eq("id", linha.assinatura_id)
      .maybeSingle();
    tutorId = assinatura?.tutor_id ?? null;
  }

  if (!tutorId) {
    await supabase.from(tabela).update({ erro_gateway: "Sem tutor_id resolvível." }).eq("id", linha.id);
    return;
  }

  const [{ data: petshop }, { data: tutor }, { data: metodo }] = await Promise.all([
    supabase.from("petshops").select("gateway_wallet_id, percentual_plataforma").eq("id", linha.petshop_id).maybeSingle(),
    supabase.from("tutores").select("forma_pagamento_preferida").eq("id", tutorId).maybeSingle(),
    supabase
      .from("metodos_pagamento")
      .select("gateway_payment_method_id")
      .eq("tutor_id", tutorId)
      .eq("padrao", true)
      .eq("ativo", true)
      .maybeSingle(),
  ]);

  if (!petshop?.gateway_wallet_id) {
    await supabase
      .from(tabela)
      .update({ erro_gateway: "Petshop sem gateway_wallet_id configurado (conectar em /admin)." })
      .eq("id", linha.id);
    return;
  }

  // fixedValue, não percentualValue — o petshop recebe o valor cheio do
  // serviço, sempre (ver calcularComposicaoPreco acima e seção 1c do plano).
  const split: SplitConfig[] = [
    {
      walletId: petshop.gateway_wallet_id,
      fixedValue: linha.valor_total,
    },
  ];

  const externalReference = linha.id;
  const usarCartao = tutor?.forma_pagamento_preferida === "cartao" && !!metodo?.gateway_payment_method_id;
  const meio: "cartao" | "pix" = usarCartao ? "cartao" : "pix";
  const { taxaGateway, valorCobrado } = calcularComposicaoPreco(linha.valor_total, linha.valor_percentual, meio);

  try {
    const customerId = await garantirClienteTutor(supabase, tutorId);
    if (!customerId) {
      await supabase
        .from(tabela)
        .update({ erro_gateway: "Tutor sem CPF cadastrado — não dá pra criar cliente no gateway." })
        .eq("id", linha.id);
      return;
    }

    if (usarCartao) {
      const cobranca = await criarCobrancaCartaoTokenizado({
        config: ASAAS_CONFIG,
        customerId,
        creditCardToken: metodo!.gateway_payment_method_id,
        valor: valorCobrado,
        vencimento: dataVencimento(0),
        descricao: `Cobrança ${tabela === "cobrancas" ? "mensal" : "de visita avulsa"} — PetClub`,
        externalReference,
        split,
      });

      await supabase
        .from(tabela)
        .update({
          status: "processando",
          gateway_payment_id: cobranca.id,
          valor_taxa_gateway: taxaGateway,
          valor_cobrado_tutor: valorCobrado,
          erro_gateway: null,
        })
        .eq("id", linha.id);
    } else {
      const cobranca = await criarCobrancaPix({
        config: ASAAS_CONFIG,
        customerId,
        valor: valorCobrado,
        vencimento: dataVencimento(DIAS_VENCIMENTO_PIX),
        descricao: `Cobrança ${tabela === "cobrancas" ? "mensal" : "de visita avulsa"} — PetClub`,
        externalReference,
        split,
      });
      const qrCode = await buscarPixQrCode(ASAAS_CONFIG, cobranca.id);

      await supabase
        .from(tabela)
        .update({
          status: "aguardando_pagamento",
          gateway_payment_id: cobranca.id,
          pix_qr_code: qrCode.payload,
          pix_expira_em: qrCode.expirationDate,
          valor_taxa_gateway: taxaGateway,
          valor_cobrado_tutor: valorCobrado,
          erro_gateway: null,
        })
        .eq("id", linha.id);

      // Gap fechado em 17/ago/2026 (docs/fase6_pagamentos.md) — gera o
      // lembrete cobranca_pix com o copia-e-cola. Falha aqui não desfaz a
      // cobrança (já criada no Asaas), só fica sem o aviso automático — ver
      // gerarLembreteCobrancaPix.
      await gerarLembreteCobrancaPix(supabase, tabela, linha, tutorId, valorCobrado, qrCode.payload);
    }
  } catch (err) {
    await supabase.from(tabela).update({ erro_gateway: descreverErro(err) }).eq("id", linha.id);
  }
}

// ----------------------------------------------------------------------------
// Mensalidade da plataforma (fee do petshop) — sempre Pix na v1 (ver nota
// em docs/fase6_pagamentos.md: metodos_pagamento.tutor_id é NOT NULL hoje,
// então petshop não tem como salvar cartão próprio sem uma migration nova
// alterando essa tabela ou criando uma equivalente pra petshop). Sem
// split: o valor inteiro é receita da plataforma.
// ----------------------------------------------------------------------------
async function processarMensalidade(
  supabase: Supa,
  linha: { id: string; petshop_id: string; valor: number }
): Promise<void> {
  try {
    const customerId = await garantirClientePetshop(supabase, linha.petshop_id);
    if (!customerId) {
      await supabase
        .from("mensalidades_petshop")
        .update({ erro_gateway: "Petshop sem CNPJ cadastrado — não dá pra criar cliente no gateway." })
        .eq("id", linha.id);
      return;
    }

    const cobranca = await criarCobrancaPix({
      config: ASAAS_CONFIG,
      customerId,
      valor: linha.valor,
      vencimento: dataVencimento(DIAS_VENCIMENTO_PIX),
      descricao: "Mensalidade da plataforma — PetClub",
      externalReference: linha.id,
    });
    const qrCode = await buscarPixQrCode(ASAAS_CONFIG, cobranca.id);

    await supabase
      .from("mensalidades_petshop")
      .update({
        status: "aguardando_pagamento",
        gateway_payment_id: cobranca.id,
        pix_qr_code: qrCode.payload,
        pix_expira_em: qrCode.expirationDate,
        erro_gateway: null,
      })
      .eq("id", linha.id);
  } catch (err) {
    await supabase.from("mensalidades_petshop").update({ erro_gateway: descreverErro(err) }).eq("id", linha.id);
  }
}

Deno.serve(async (req: Request) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!ASAAS_API_KEY) {
    return new Response(JSON.stringify({ erro: "ASAAS_API_KEY não configurada." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  // Retry (tentativas 1-2) tem proxima_tentativa_em no futuro/passado, mas
  // continua status='pendente' até a 3ª falha (ver registrar_falha_pagamento
  // na migration 0006) — por isso o filtro é só por status + a janela de
  // retry, sem precisar distinguir "cobrança nova" de "retry" aqui.
  const agoraIso = new Date().toISOString();

  const [{ data: cobrancas }, { data: avulsas }, { data: mensalidades }] = await Promise.all([
    supabase
      .from("cobrancas")
      .select("id, petshop_id, assinatura_id, valor_total, valor_petshop, valor_percentual")
      .eq("status", "pendente")
      .or(`proxima_tentativa_em.is.null,proxima_tentativa_em.lte.${agoraIso}`)
      .limit(TAMANHO_LOTE),
    supabase
      .from("cobrancas_avulsas")
      .select("id, petshop_id, tutor_id, agendamento_id, valor_total, valor_petshop, valor_percentual")
      .eq("status", "pendente")
      .or(`proxima_tentativa_em.is.null,proxima_tentativa_em.lte.${agoraIso}`)
      .limit(TAMANHO_LOTE),
    supabase
      .from("mensalidades_petshop")
      .select("id, petshop_id, valor")
      .eq("status", "pendente")
      .or(`proxima_tentativa_em.is.null,proxima_tentativa_em.lte.${agoraIso}`)
      .limit(TAMANHO_LOTE),
  ]);

  for (const linha of cobrancas ?? []) {
    await processarCobrancaTutor(supabase, "cobrancas", { ...linha, tutor_id: null });
  }
  for (const linha of avulsas ?? []) {
    await processarCobrancaTutor(supabase, "cobrancas_avulsas", linha);
  }
  for (const linha of mensalidades ?? []) {
    await processarMensalidade(supabase, linha);
  }

  return new Response(
    JSON.stringify({
      cobrancas: cobrancas?.length ?? 0,
      avulsas: avulsas?.length ?? 0,
      mensalidades: mensalidades?.length ?? 0,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
