// Cliente da WhatsApp Cloud API (Meta) — chamada HTTP direta ao Graph API,
// sem SDK, só fetch + Bearer token. Mesmo motivo de antes: uma Edge Function
// que faz uma chamada por lembrete não precisa carregar dependência.
//
// DIFERENÇA CENTRAL PRA UM PROVEDOR-INTERMEDIÁRIO (era Twilio até a
// refatoração desta fase): na Meta, mensagem business-initiated — que é
// exatamente o caso de TODOS os nossos lembretes — só pode sair como
// `type: "template"`, com um template previamente aprovado no WhatsApp
// Manager. Texto livre (`type: "text"`) só é aceito dentro da janela de
// atendimento de 24h, que abre quando o próprio usuário manda mensagem pro
// número. Por isso este módulo expõe as duas funções, e quem decide qual
// usar é enviar-lembretes/index.ts consultando `janela_whatsapp_aberta()`
// no banco (ver 0005_fase5_lembretes_whatsapp.sql).
//
// Os templates que precisam estar aprovados estão catalogados em
// docs/whatsapp_templates_meta.md e mapeados em ./templates.ts.

export interface MetaConfig {
  /** Phone Number ID do número (WhatsApp Manager), NÃO o telefone em si. */
  phoneNumberId: string;
  /** Token permanente de System User com whatsapp_business_messaging. */
  accessToken: string;
  /** Versão do Graph API, ex.: "v21.0". */
  graphVersion: string;
}

export interface EnvioResult {
  /** wamid.* — id da mensagem na Meta, chega de volta no webhook de status. */
  wamid: string;
}

/**
 * Parâmetro posicional de template ({{1}}, {{2}}, ...). A Meta só aceita
 * texto puro aqui pros nossos casos — nada de mídia/currency/date_time.
 */
export type ParametroTemplate = string;

export interface TemplateWhatsApp {
  /** `name` do template no WhatsApp Manager, ex.: "confirmacao_agendamento". */
  nome: string;
  /** `language.code`, ex.: "pt_BR". Precisa bater exatamente com o aprovado. */
  idioma: string;
  /** Parâmetros do corpo, na ordem de {{1}}..{{n}}. */
  parametrosCorpo: ParametroTemplate[];
  /**
   * Sufixo dinâmico do botão de URL, quando o template tem um. O template
   * aprovado guarda a base (ex.: https://app.exemplo.com/confirmar/{{1}}) e
   * a API só recebe o pedaço variável — mandar a URL inteira aqui gera uma
   * URL duplicada, é o erro clássico dessa integração.
   */
  parametroBotaoUrl?: string;
}

/** Erro da Meta com os campos que realmente ajudam a depurar. */
export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly codigo: number | null,
    readonly subcodigo: number | null,
    readonly fbtraceId: string | null,
    readonly httpStatus: number
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

/**
 * A Meta espera o destino em E.164 SEM o "+" e sem separadores
 * (ex.: 5548999998888). Aceita com "+" na prática, mas normalizar aqui
 * evita depender desse comportamento não documentado.
 */
export function normalizarTelefone(telefone: string): string {
  const digitos = telefone.replace(/\D/g, "");
  // Sem coluna de país em tutores/petshops — assume Brasil quando o número
  // não veio com DDI. 10/11 dígitos = DDD + número; a partir de 12 já tem DDI.
  if (digitos.length <= 11) return `55${digitos}`;
  return digitos;
}

// deno-lint-ignore no-explicit-any
async function postMensagem(config: MetaConfig, payload: Record<string, any>): Promise<EnvioResult> {
  const url = `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`;

  const resposta = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const dados = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    const erro = dados?.error ?? {};
    // error_data.details costuma ser MUITO mais específico que error.message
    // (é ele que diz "template name does not exist" ou "param count
    // mismatch"), mas nem sempre vem — daí o coalesce.
    const detalhe = erro?.error_data?.details ?? erro?.message ?? `Meta respondeu ${resposta.status}`;
    throw new MetaApiError(
      detalhe,
      typeof erro?.code === "number" ? erro.code : null,
      typeof erro?.error_subcode === "number" ? erro.error_subcode : null,
      typeof erro?.fbtrace_id === "string" ? erro.fbtrace_id : null,
      resposta.status
    );
  }

  const wamid = dados?.messages?.[0]?.id;
  if (typeof wamid !== "string") {
    // 2xx sem wamid não deveria acontecer; falhar aqui é melhor do que
    // marcar 'enviado' com provider_message_id nulo e perder o rastro no
    // webhook de status.
    throw new MetaApiError("Meta respondeu 2xx sem messages[0].id", null, null, null, resposta.status);
  }

  return { wamid };
}

/** Mensagem business-initiated — o caminho padrão de todos os lembretes. */
export function enviarTemplate(
  config: MetaConfig,
  destino: string,
  template: TemplateWhatsApp
): Promise<EnvioResult> {
  // deno-lint-ignore no-explicit-any
  const componentes: Record<string, any>[] = [];

  if (template.parametrosCorpo.length > 0) {
    componentes.push({
      type: "body",
      parameters: template.parametrosCorpo.map((texto) => ({ type: "text", text: texto })),
    });
  }

  if (template.parametroBotaoUrl) {
    componentes.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: template.parametroBotaoUrl }],
    });
  }

  return postMensagem(config, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizarTelefone(destino),
    type: "template",
    template: {
      name: template.nome,
      language: { code: template.idioma },
      ...(componentes.length > 0 ? { components: componentes } : {}),
    },
  });
}

/**
 * Texto livre — SÓ vale dentro da janela de 24h. Fora dela a Meta rejeita
 * com código 131047 ("Message failed to send because more than 24 hours
 * have passed since the customer last replied"); quem chama precisa ter
 * checado a janela antes.
 */
export function enviarTexto(config: MetaConfig, destino: string, corpo: string): Promise<EnvioResult> {
  return postMensagem(config, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizarTelefone(destino),
    type: "text",
    text: { preview_url: true, body: corpo },
  });
}
