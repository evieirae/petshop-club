// Cliente do gateway de pagamento (Asaas, ver docs/fase6_pagamentos.md seção
// 1) — chamada HTTP direta à API REST, sem SDK, mesmo padrão de
// _shared/meta-whatsapp.ts na Fase 5.
//
// AVISO — RASCUNHO NÃO TESTADO: escrito antes de existir conta no Asaas
// (fatia 0 do plano em docs/fase6_pagamentos.md, deixada em standby porque
// abrir conta em gateway financeiro exige CPF/CNPJ e senha, que é ação
// vedada pra automação). Os endpoints e payloads abaixo seguem a
// documentação pública (docs.asaas.com), mas NUNCA foram exercitados contra
// o sandbox de verdade. Antes de usar isto contra uma cobrança real:
//   1. Abrir a conta e o sandbox (fatia 0).
//   2. Bater cada função aqui contra o sandbox com um Postman/curl antes de
//      confiar no shape da resposta.
//   3. Só então ligar processar-cobrancas/index.ts em produção.
//
// Documentação de referência:
//   - Criar cobrança:      https://docs.asaas.com/reference/criar-nova-cobranca
//   - Split de pagamento:  https://docs.asaas.com/docs/split-de-pagamentos
//   - QR Code Pix:         https://docs.asaas.com/docs/cobrancas-via-pix
//   - Tokenização cartão:  https://docs.asaas.com/reference/tokenizacao-de-cartao-de-credito
//   - Webhooks:            https://docs.asaas.com/docs/sobre-os-webhooks

export interface AsaasConfig {
  /** Chave de API da conta (sandbox ou produção — endpoints diferentes). */
  apiKey: string;
  /** true = https://api-sandbox.asaas.com, false = https://api.asaas.com. */
  sandbox: boolean;
}

function baseUrl(config: AsaasConfig): string {
  return config.sandbox ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
}

export class AsaasApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly errors: unknown
  ) {
    super(message);
    this.name = "AsaasApiError";
  }
}

// deno-lint-ignore no-explicit-any
async function chamar<T>(config: AsaasConfig, metodo: string, caminho: string, corpo?: Record<string, any>): Promise<T> {
  const resposta = await fetch(`${baseUrl(config)}${caminho}`, {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      // Header oficial da API do Asaas — não é Bearer/Authorization.
      access_token: config.apiKey,
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

  const dados = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    const mensagem = dados?.errors?.[0]?.description ?? `Asaas respondeu ${resposta.status}`;
    throw new AsaasApiError(mensagem, resposta.status, dados?.errors ?? dados);
  }

  return dados as T;
}

export interface SplitConfig {
  /** Carteira do petshop (petshops.gateway_wallet_id) que recebe o repasse. */
  walletId: string;
  /**
   * Valor FIXO repassado ao petshop, em reais — não percentual. Decisão de
   * 16/ago/2026 (docs/fase6_pagamentos.md, seção 1c): a doc do Asaas
   * confirma que `percentualValue` é calculado sobre o valor LÍQUIDO da
   * cobrança (já descontada a taxa do gateway), o que faria o petshop
   * receber menos do que o sistema registra. Com `fixedValue`, o petshop
   * recebe exatamente esse valor — a taxa do gateway (e a receita da
   * plataforma) saem do valor a mais cobrado do tutor, nunca da fatia
   * dele. Ver `docs.asaas.com/docs/duvidas-frequentes-split`.
   */
  fixedValue: number;
}

export interface CriarCobrancaPixInput {
  config: AsaasConfig;
  /** gateway_customer_id do tutor em metodos_pagamento, OU do petshop (fee). */
  customerId: string;
  valor: number;
  vencimento: string; // "YYYY-MM-DD"
  descricao: string;
  /** cobrancas.id / cobrancas_avulsas.id / mensalidades_petshop.id — pra casar o webhook depois e pra dedupe (não recriar cobrança já criada). */
  externalReference: string;
  split?: SplitConfig[];
}

export interface CobrancaAsaas {
  id: string;
  status: string;
  value: number;
}

export interface PixQrCode {
  /** Imagem do QR em base64 (sem o prefixo data:image/...). */
  encodedImage: string;
  /** Código copia-e-cola. */
  payload: string;
  expirationDate: string;
}

/** Cria uma cobrança Pix — QR dinâmico com vencimento (seção 6/7 do plano). */
export async function criarCobrancaPix(input: CriarCobrancaPixInput): Promise<CobrancaAsaas> {
  return chamar<CobrancaAsaas>(input.config, "POST", "/payments", {
    customer: input.customerId,
    billingType: "PIX",
    value: input.valor,
    dueDate: input.vencimento,
    description: input.descricao,
    externalReference: input.externalReference,
    ...(input.split && input.split.length > 0 ? { split: input.split } : {}),
  });
}

/** Busca o QR Code (imagem + copia-e-cola) de uma cobrança Pix já criada. */
export async function buscarPixQrCode(config: AsaasConfig, cobrancaId: string): Promise<PixQrCode> {
  return chamar<PixQrCode>(config, "GET", `/payments/${cobrancaId}/pixQrCode`);
}

export interface CriarCobrancaCartaoInput {
  config: AsaasConfig;
  customerId: string;
  /** metodos_pagamento.gateway_payment_method_id — token do cartão salvo (ver seção 5 do plano). */
  creditCardToken: string;
  valor: number;
  vencimento: string; // "YYYY-MM-DD" — cobrança de cartão tokenizado processa no mesmo dia
  descricao: string;
  externalReference: string;
  split?: SplitConfig[];
}

/**
 * Cobra o cartão tokenizado do tutor. Exige que a habilitação de
 * tokenização em produção já tenha sido aprovada pelo Asaas (fatia 0 do
 * plano) — sem isso, `creditCardToken` não é um recurso disponível na
 * conta.
 */
export async function criarCobrancaCartaoTokenizado(input: CriarCobrancaCartaoInput): Promise<CobrancaAsaas> {
  return chamar<CobrancaAsaas>(input.config, "POST", "/payments", {
    customer: input.customerId,
    billingType: "CREDIT_CARD",
    value: input.valor,
    dueDate: input.vencimento,
    description: input.descricao,
    externalReference: input.externalReference,
    creditCardToken: input.creditCardToken,
    ...(input.split && input.split.length > 0 ? { split: input.split } : {}),
  });
}

export interface CriarClienteInput {
  config: AsaasConfig;
  nome: string;
  /** CPF/CNPJ — obrigatório pro Asaas cadastrar o cliente. */
  cpfCnpj: string;
  telefone?: string;
  email?: string;
  /** tutores.id ou petshops.id — pra rastrear no nosso lado. */
  externalReference: string;
}

export interface ClienteAsaas {
  id: string; // vira metodos_pagamento.gateway_customer_id ou petshops.gateway_customer_id
}

/**
 * Cadastra o cliente no Asaas (tutor ou petshop-como-pagador). Precisa
 * rodar ANTES de tokenizar cartão ou gerar a 1ª cobrança Pix — é o
 * `customer` que as duas funções acima esperam.
 */
export async function criarCliente(input: CriarClienteInput): Promise<ClienteAsaas> {
  return chamar<ClienteAsaas>(input.config, "POST", "/customers", {
    name: input.nome,
    cpfCnpj: input.cpfCnpj,
    mobilePhone: input.telefone,
    email: input.email,
    externalReference: input.externalReference,
  });
}

/**
 * Consulta o status atual de uma cobrança — usado pelo job de
 * reconciliação (seção 16 do plano: cobrança presa em 'processando'/
 * 'aguardando_pagamento' há mais de 24h, pro caso do webhook ter falhado
 * em chegar).
 */
export async function consultarCobranca(config: AsaasConfig, cobrancaId: string): Promise<CobrancaAsaas> {
  return chamar<CobrancaAsaas>(config, "GET", `/payments/${cobrancaId}`);
}

/**
 * Estorna uma cobrança (seção 10 do plano — visita cancelada pelo
 * petshop). v1 é sempre estorno total, disparado manualmente pela tela
 * financeira, nunca automático.
 */
export async function estornarCobranca(config: AsaasConfig, cobrancaId: string): Promise<CobrancaAsaas> {
  return chamar<CobrancaAsaas>(config, "POST", `/payments/${cobrancaId}/refund`);
}

/**
 * Mapeia o `event` que chega no webhook do Asaas pro nosso status interno.
 * PAYMENT_RECEIVED/PAYMENT_CONFIRMED = pago; PAYMENT_OVERDUE = falha
 * (Pix expirado ou boleto vencido); demais eventos (ex.: PAYMENT_DELETED)
 * não mexem em status por enquanto — logados em eventos_gateway mesmo
 * assim, pra auditoria.
 * Ver https://docs.asaas.com/docs/payment-events pra lista completa.
 */
export function classificarEventoWebhook(evento: string): "pago" | "falhou" | "ignorado" {
  if (evento === "PAYMENT_RECEIVED" || evento === "PAYMENT_CONFIRMED") return "pago";
  if (evento === "PAYMENT_OVERDUE") return "falhou";
  return "ignorado";
}
