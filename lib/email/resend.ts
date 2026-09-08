// Cliente do Resend — chamada HTTP direta (fetch + Bearer token), sem SDK.
// Mesmo espírito de supabase/functions/_shared/meta-whatsapp.ts pro
// WhatsApp: é uma chamada por envio, não vale a pena carregar dependência.
// Roda em Node (Server Actions do Next), não em Deno — por isso mora em
// lib/, não em supabase/functions/_shared/.
//
// Diferença central pro WhatsApp: aqui não existe template aprovado por
// terceiro. O HTML/texto vem pronto de lib/email/templates.ts e é enviado
// direto — sem aprovação, sem `language.code`, sem componentes.
//
// Ver .env.example pra RESEND_API_KEY e EMAIL_REMETENTE. Sem
// RESEND_API_KEY configurada, enviarEmail() nem tenta a chamada — devolve
// { ok: false, motivo: "sem_api_key" } e loga, sem lançar. Quem chama trata
// isso como "e-mail não saiu, mas a ação principal (criar login, resetar
// senha) já aconteceu": a senha continua aparecendo na tela, como sempre
// apareceu — ausência de e-mail configurado nunca pode quebrar um fluxo que
// já funcionava sem e-mail.

export interface EmailEnvio {
  destinatario: string;
  assunto: string;
  html: string;
  texto: string;
}

export type ResultadoEnvioEmail =
  | { ok: true; id: string }
  | { ok: false; motivo: "sem_api_key" | "erro_provedor"; detalhe?: string };

function remetente(): string {
  // "Nome <endereco@dominio>" — ver .env.example. Sem EMAIL_REMETENTE
  // configurado, cai num remetente de teste do próprio Resend, só pra não
  // quebrar a chamada — mas isso só entrega de verdade depois que o
  // domínio for verificado (ver .env.example), então vale configurar antes
  // de confiar nesse caminho em produção.
  return process.env.EMAIL_REMETENTE?.trim() || "PetClub <onboarding@resend.dev>";
}

export async function enviarEmail(envio: EmailEnvio): Promise<ResultadoEnvioEmail> {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    console.error(
      "RESEND_API_KEY não configurada — e-mail não enviado (a ação principal já foi concluída de qualquer forma):",
      envio.assunto,
      "->",
      envio.destinatario
    );
    return { ok: false, motivo: "sem_api_key" };
  }

  try {
    const resposta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: remetente(),
        to: [envio.destinatario],
        subject: envio.assunto,
        html: envio.html,
        text: envio.texto,
      }),
    });

    const dados = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      const detalhe = typeof dados?.message === "string" ? dados.message : `Resend respondeu ${resposta.status}`;
      console.error("Erro ao enviar e-mail via Resend:", detalhe, "->", envio.destinatario);
      return { ok: false, motivo: "erro_provedor", detalhe };
    }

    return { ok: true, id: typeof dados?.id === "string" ? dados.id : "" };
  } catch (erro) {
    console.error("Erro de rede ao chamar o Resend:", erro);
    return { ok: false, motivo: "erro_provedor", detalhe: String(erro) };
  }
}

/**
 * URL pública do app, pra montar links absolutos dentro de e-mails — não dá
 * pra usar window.location.origin aqui (roda no servidor). Ordem:
 * NEXT_PUBLIC_APP_URL (produção, configurada explicitamente) -> VERCEL_URL
 * (preview deploys, a Vercel já injeta sozinha) -> localhost (dev local).
 */
export function appUrl(): string {
  const explicita = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicita) return explicita.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
