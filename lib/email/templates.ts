// HTML/texto dos e-mails transacionais de acesso — convite (primeiro
// cadastro) e reset de senha, tanto pro tutor (Portal do Tutor) quanto pra
// equipe do petshop (painel). Mesmo conteúdo nos dois casos (criar e
// resetar acesso): o que muda é só o título/abertura, por isso
// `novoCadastro` como flag em vez de funções separadas por fluxo.
//
// Formato: HTML de uma coluna, botão como <a> com background-color inline
// (não dá pra confiar em <button> nem em <style> em bloco — vários
// clientes de e-mail corporativo cortam isso), sempre acompanhado da
// versão texto/plain simples, porque parte desses clientes bloqueia HTML
// por padrão. Cores vêm de lib/design/tokens.ts (brand.500/700,
// surface.page) copiadas aqui como constante — e-mail não passa pelo
// Tailwind/CSS variables do app, então não dá pra importar direto.

import { appUrl } from "./resend";

const AZUL = "#2B6CB0"; // brand.500
const AZUL_ESCURO = "#1D4877"; // brand.700
const CINZA_TEXTO = "#4A5568";
const CINZA_CLARO = "#F7FAFC"; // surface.page
const CINZA_RODAPE = "#A0AEC0";

function layout(opts: {
  titulo: string;
  corpoHtml: string;
  botaoTexto: string;
  botaoUrl: string;
}): string {
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background-color:${CINZA_CLARO};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background-color:${AZUL};padding:20px 32px;">
                <span style="color:#ffffff;font-size:18px;font-weight:600;">Clube de Banho e Tosa</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;color:${AZUL_ESCURO};">${opts.titulo}</h1>
                <div style="font-size:15px;line-height:1.6;color:${CINZA_TEXTO};">${opts.corpoHtml}</div>
                <div style="margin-top:28px;">
                  <a href="${opts.botaoUrl}" style="display:inline-block;background-color:${AZUL};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">${opts.botaoTexto}</a>
                </div>
                <p style="margin-top:24px;font-size:13px;color:${CINZA_RODAPE};">Se você não esperava este e-mail, ignore — nenhuma alteração foi feita sem essa senha.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function formatarPrazo(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface EmailAcessoTutorInput {
  nome: string;
  email: string;
  senha: string;
  expiraEm: string; // ISO — tutores.senha_provisoria_expira_em
  tutorId: string;
  /** true = primeiro cadastro (criarTutorComAcesso); false = senha nova (liberarAcessoTutor). */
  novoCadastro: boolean;
}

export interface EmailPronto {
  assunto: string;
  html: string;
  texto: string;
}

export function emailAcessoTutor(dados: EmailAcessoTutorInput): EmailPronto {
  const base = appUrl();
  const linkLogin = `${base}/login`;
  const linkCadastro = `${base}/cadastro/${dados.tutorId}`;
  const prazo = formatarPrazo(dados.expiraEm);

  const assunto = dados.novoCadastro
    ? "Seu acesso ao Portal do Tutor"
    : "Sua nova senha do Portal do Tutor";

  const titulo = dados.novoCadastro ? "Bem-vindo ao Portal do Tutor" : "Nova senha gerada";

  const abertura = dados.novoCadastro
    ? `Olá, ${dados.nome}! Seu acesso ao Portal do Tutor já está pronto.`
    : `Olá, ${dados.nome}! Uma senha nova foi gerada pro seu acesso ao Portal do Tutor.`;

  const corpoHtml = `
    <p style="margin:0 0 12px;">${abertura}</p>
    <p style="margin:0 0 4px;"><strong>Login:</strong> ${dados.email}</p>
    <p style="margin:0 0 16px;"><strong>Senha temporária:</strong> <span style="font-family:monospace;font-size:16px;background:${CINZA_CLARO};padding:2px 8px;border-radius:4px;">${dados.senha}</span></p>
    <p style="margin:0 0 12px;">Essa senha vale até <strong>${prazo}</strong> e pede troca no primeiro acesso.</p>
    <p style="margin:0;">Se ainda não completou o cadastro de endereço e dos seus pets, <a href="${linkCadastro}" style="color:${AZUL};">preencha por aqui</a>.</p>
  `;

  const html = layout({ titulo, corpoHtml, botaoTexto: "Entrar no Portal do Tutor", botaoUrl: linkLogin });

  const texto = `${abertura}

Login: ${dados.email}
Senha temporária: ${dados.senha}
Vale até: ${prazo}

Entrar: ${linkLogin}
Completar cadastro (endereço e pets): ${linkCadastro}

Se você não esperava este e-mail, ignore.`;

  return { assunto, html, texto };
}

export interface EmailAcessoPetshopInput {
  nomeUsuario: string;
  nomePetshop: string;
  email: string;
  senha: string;
  /** true = primeiro cadastro (criarPetshopComDono); false = reset (resetarSenhaUsuarioPetshop). */
  novoCadastro: boolean;
}

export function emailAcessoPetshop(dados: EmailAcessoPetshopInput): EmailPronto {
  const linkLogin = `${appUrl()}/login`;

  const assunto = dados.novoCadastro
    ? `Seu acesso ao painel do ${dados.nomePetshop}`
    : "Sua nova senha do painel PetClub";

  const titulo = dados.novoCadastro ? "Bem-vindo ao PetClub" : "Nova senha gerada";

  const abertura = dados.novoCadastro
    ? `Olá, ${dados.nomeUsuario}! O painel do ${dados.nomePetshop} já está pronto.`
    : `Olá, ${dados.nomeUsuario}! Uma senha nova foi gerada pro seu acesso ao painel.`;

  const corpoHtml = `
    <p style="margin:0 0 12px;">${abertura}</p>
    <p style="margin:0 0 4px;"><strong>Login:</strong> ${dados.email}</p>
    <p style="margin:0 0 16px;"><strong>Senha temporária:</strong> <span style="font-family:monospace;font-size:16px;background:${CINZA_CLARO};padding:2px 8px;border-radius:4px;">${dados.senha}</span></p>
    <p style="margin:0;">${
      dados.novoCadastro
        ? "Depois de entrar, você pode trocar a senha e completar a configuração do petshop (expediente, horários de mensagem, taxas) na tela de Configurações."
        : "Depois de entrar, você pode trocar por uma senha definitiva em Configurações."
    }</p>
  `;

  const html = layout({ titulo, corpoHtml, botaoTexto: "Entrar no painel", botaoUrl: linkLogin });

  const texto = `${abertura}

Login: ${dados.email}
Senha temporária: ${dados.senha}

Entrar: ${linkLogin}

Se você não esperava este e-mail, ignore.`;

  return { assunto, html, texto };
}
