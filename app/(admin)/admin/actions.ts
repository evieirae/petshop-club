"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ERRO_TELEFONE_DUPLICADO, ehTelefoneDuplicado } from "@/lib/supabase/erros";
import { getAdminContext } from "@/lib/auth/getAdminContext";
import { senhaInicialTutor } from "@/lib/auth/senhaTutor";
import { enviarEmail } from "@/lib/email/resend";
import { emailAcessoPetshop, emailAcessoTutor } from "@/lib/email/templates";
import type { Petshop, StatusLeadSaas } from "@/types/database";

export type ActionResult = { ok: true } | { ok: false; erro: string };

const ERRO_GENERICO = "Não deu pra salvar. Tenta de novo em alguns segundos.";

// ----------------------------------------------------------------------------
// Taxas da plataforma — movida de app/(app)/admin/actions.ts (agora vive em
// app/(admin), fora do grupo de rota do petshop), mesma lógica de sempre.
// Não precisa checar "quem está chamando isso é admin?" na mão aqui: a RLS
// (auth_admin_plataforma() na policy de `petshops`) e o trigger
// trg_petshops_protege_taxas já rejeitam no banco qualquer tentativa de
// quem não tem a flag — usa o client comum (createClient()), não o de
// service role.
// ----------------------------------------------------------------------------
export type TaxasPlataformaInput = Pick<
  Petshop,
  "fee_fixo_mensal" | "percentual_plataforma" | "isento_fee_ate"
>;

export async function atualizarTaxasPlataforma(
  petshopId: string,
  dados: TaxasPlataformaInput
): Promise<ActionResult> {
  const supabase = createClient();

  const { error, count } = await supabase
    .from("petshops")
    .update(dados, { count: "exact" })
    .eq("id", petshopId);

  if (error) {
    console.error("Erro ao atualizar taxas do petshop:", error);
    return {
      ok: false,
      erro: error.message.includes("Somente a administração")
        ? error.message
        : ERRO_GENERICO,
    };
  }
  if (!count) {
    return {
      ok: false,
      erro: "Nenhuma linha foi alterada — confirme se o petshop ainda existe.",
    };
  }

  revalidatePath("/admin/petshops");
  revalidatePath("/configuracoes");
  return { ok: true };
}

// ----------------------------------------------------------------------------
// Status do petshop (ativo/congelado/encerrado) — mesmo padrão de proteção
// de atualizarTaxasPlataforma (RLS + trigger trg_petshops_protege_status,
// ver 0017_admin_plataforma_independente.sql).
// ----------------------------------------------------------------------------
export async function atualizarStatusPetshop(
  petshopId: string,
  status: Petshop["status"]
): Promise<ActionResult> {
  const supabase = createClient();

  const { error, count } = await supabase
    .from("petshops")
    .update({ status }, { count: "exact" })
    .eq("id", petshopId);

  if (error) {
    console.error("Erro ao atualizar status do petshop:", error);
    return {
      ok: false,
      erro: error.message.includes("Somente a administração")
        ? error.message
        : ERRO_GENERICO,
    };
  }
  if (!count) {
    return {
      ok: false,
      erro: "Nenhuma linha foi alterada — confirme se o petshop ainda existe.",
    };
  }

  revalidatePath("/admin/petshops");
  revalidatePath("/admin");
  return { ok: true };
}

// ----------------------------------------------------------------------------
// Novo petshop + novo dono — a ÚNICA action deste arquivo que usa
// createAdminClient() (service role), porque supabase.auth.admin.createUser()
// não existe com a anon key. Sem RLS por baixo pra segurar quem não devia
// chamar isso, então o check de admin abaixo NÃO é redundante com a RLS —
// é a única barreira (ver regra 4 do comentário em lib/supabase/admin.ts).
// ----------------------------------------------------------------------------

// Alfabeto sem caracteres ambíguos (sem 0/O, 1/l/I) — a senha é lida e
// digitada por uma pessoa, não colada de um gerenciador de senhas.
const ALFABETO_SENHA = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function gerarSenhaTemporaria(): string {
  const bytes = randomBytes(12);
  let senha = "";
  for (let i = 0; i < bytes.length; i++) {
    senha += ALFABETO_SENHA[bytes[i] % ALFABETO_SENHA.length];
  }
  return senha;
}

export type NovoPetshopInput = {
  nomePetshop: string;
  nomeDono: string;
  emailDono: string;
  // Preenchido quando o cadastro nasce a partir de um lead (app/(admin)/admin/leads) —
  // marca o lead como convertido e liga ele ao petshop novo.
  leadId?: string | null;
};

export async function criarPetshopComDono(
  dados: NovoPetshopInput
): Promise<
  | { ok: true; senhaTemporaria: string; emailEnviado: boolean }
  | { ok: false; erro: string }
> {
  const admin = await getAdminContext();
  if (!admin) {
    return { ok: false, erro: "Sem permissão de administração." };
  }

  const nomePetshop = dados.nomePetshop.trim();
  const nomeDono = dados.nomeDono.trim();
  const emailDono = dados.emailDono.trim();

  if (!nomePetshop || !nomeDono || !emailDono) {
    return { ok: false, erro: "Preencha nome do petshop, nome e e-mail do dono." };
  }

  const supabaseAdmin = createAdminClient();
  const senhaTemporaria = gerarSenhaTemporaria();

  const { data: authData, error: erroAuth } = await supabaseAdmin.auth.admin.createUser({
    email: emailDono,
    password: senhaTemporaria,
    email_confirm: true,
  });

  if (erroAuth || !authData.user) {
    console.error("Erro ao criar usuário do dono:", erroAuth);
    return {
      ok: false,
      erro: erroAuth?.message.includes("already been registered")
        ? "Já existe uma conta com esse e-mail."
        : ERRO_GENERICO,
    };
  }

  const { data: petshop, error: erroPetshop } = await supabaseAdmin
    .from("petshops")
    .insert({ nome: nomePetshop })
    .select("id")
    .single();

  if (erroPetshop || !petshop) {
    console.error("Erro ao criar petshop:", erroPetshop);
    // O usuário de auth já nasceu — não deixa esse login órfão (sem
    // nenhum petshop vinculado, sem explicação nenhuma) pendurado.
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    return { ok: false, erro: ERRO_GENERICO };
  }

  const { error: erroUsuario } = await supabaseAdmin.from("usuarios_petshop").insert({
    petshop_id: petshop.id,
    auth_user_id: authData.user.id,
    nome: nomeDono,
    papel: "dono",
  });

  if (erroUsuario) {
    console.error("Erro ao vincular dono ao petshop novo:", erroUsuario);
    return {
      ok: false,
      erro:
        "O petshop foi criado, mas não deu pra vincular o dono. Vincule manualmente em usuarios_petshop pelo SQL Editor.",
    };
  }

  if (dados.leadId) {
    await supabaseAdmin
      .from("leads_saas")
      .update({ status: "convertido", petshop_id: petshop.id })
      .eq("id", dados.leadId);
  }

  // E-mail de boas-vindas com a senha temporária (ver lib/email/). Falha de
  // envio não desfaz nada acima — petshop e dono já existem, e a senha
  // continua aparecendo na tela pra copiar manualmente, mesmo fallback de
  // sempre (NovoPetshopForm.tsx).
  const conteudoEmail = emailAcessoPetshop({
    nomeUsuario: nomeDono,
    nomePetshop,
    email: emailDono,
    senha: senhaTemporaria,
    novoCadastro: true,
  });
  const resultadoEmail = await enviarEmail({
    destinatario: emailDono,
    assunto: conteudoEmail.assunto,
    html: conteudoEmail.html,
    texto: conteudoEmail.texto,
  });

  revalidatePath("/admin/petshops");
  revalidatePath("/admin/leads");
  revalidatePath("/admin");

  return { ok: true, senhaTemporaria, emailEnviado: resultadoEmail.ok };
}

// ----------------------------------------------------------------------------
// Leads do site institucional (app/(admin)/admin/leads) — client comum, a
// policy "atualizacao_admin" de leads_saas (0018_leads_saas.sql) já protege.
// ----------------------------------------------------------------------------
export async function atualizarStatusLead(
  leadId: string,
  status: StatusLeadSaas
): Promise<ActionResult> {
  const supabase = createClient();

  const { error, count } = await supabase
    .from("leads_saas")
    .update({ status }, { count: "exact" })
    .eq("id", leadId);

  if (error) {
    console.error("Erro ao atualizar status do lead:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!count) {
    return { ok: false, erro: "Nenhuma linha foi alterada — confirme se o lead ainda existe." };
  }

  revalidatePath("/admin/leads");
  return { ok: true };
}

// ----------------------------------------------------------------------------
// TUTORES (migration 0024_portal_tutor_acesso.sql)
//
// A administração da plataforma cadastra tutor pra qualquer petshop,
// escolhendo o petshop na tela — é o mesmo papel de "administrador de rede"
// que ela já tem pra petshops e leads.
//
// Todas as três actions abaixo usam service role pelo mesmo motivo de
// criarPetshopComDono: `auth.admin.createUser()` / `updateUserById()` não
// existem com anon key. Vale a regra 4 de lib/supabase/admin.ts — o
// getAdminContext() no topo NÃO é redundante com a RLS, é a única barreira.
// ----------------------------------------------------------------------------

export type NovoTutorInput = {
  petshopId: string;
  nome: string;
  telefone: string;
  email: string;
};

export type ResultadoAcessoTutor =
  | { ok: true; senha: string; senhaPadrao: boolean; expiraEm: string; emailEnviado: boolean }
  | { ok: false; erro: string };

/**
 * Cria o tutor NO petshop escolhido e já transforma o e-mail dele num login.
 *
 * O tutor nasce com `cadastro_completo = false`: o endereço e os pets
 * continuam vindo do formulário público de autopreenchimento (seção 6 das
 * regras). Esta tela não substitui aquele fluxo, ela só adianta o cadastro
 * mínimo + o acesso.
 */
export async function criarTutorComAcesso(
  dados: NovoTutorInput
): Promise<ResultadoAcessoTutor> {
  const admin = await getAdminContext();
  if (!admin) return { ok: false, erro: "Sem permissão de administração." };

  const nome = dados.nome.trim();
  const telefone = dados.telefone.trim();
  const email = dados.email.trim().toLowerCase();

  if (!dados.petshopId) return { ok: false, erro: "Escolha o petshop do tutor." };
  if (!nome || !telefone || !email) {
    return { ok: false, erro: "Preencha nome, telefone e e-mail do tutor." };
  }

  const supabaseAdmin = createAdminClient();

  // O mesmo e-mail não pode virar dois tutores: o login é único no Auth, e
  // um segundo cadastro ficaria pra sempre sem acesso. Checa antes pra dar
  // uma mensagem que explica, em vez do erro cru do Auth.
  const { data: jaExiste } = await supabaseAdmin
    .from("tutores")
    .select("id, petshop_id")
    .eq("email", email)
    .maybeSingle();

  if (jaExiste) {
    return {
      ok: false,
      erro: "Já existe um tutor com esse e-mail. Libere o acesso dele em vez de cadastrar de novo.",
    };
  }

  const { senha, padrao, expiraEm } = senhaInicialTutor();

  const { data: authData, error: erroAuth } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });

  if (erroAuth || !authData.user) {
    console.error("Erro ao criar login do tutor:", erroAuth);
    return {
      ok: false,
      erro: erroAuth?.message.includes("already been registered")
        ? "Esse e-mail já é usado como login no PetClub (pode ser de uma equipe de petshop)."
        : ERRO_GENERICO,
    };
  }

  const { data: tutorCriado, error: erroTutor } = await supabaseAdmin
    .from("tutores")
    .insert({
      petshop_id: dados.petshopId,
      nome,
      telefone,
      email,
      auth_user_id: authData.user.id,
      acesso_liberado: true,
      acesso_liberado_em: new Date().toISOString(),
      senha_provisoria: true,
      senha_provisoria_expira_em: expiraEm,
    })
    .select("id")
    .single();

  if (erroTutor || !tutorCriado) {
    console.error("Erro ao criar tutor:", erroTutor);
    // Mesmo cuidado de criarPetshopComDono: não deixar login órfão, sem
    // tutor nenhum atrás, pendurado no Auth.
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    return {
      ok: false,
      erro: ehTelefoneDuplicado(erroTutor) ? ERRO_TELEFONE_DUPLICADO : ERRO_GENERICO,
    };
  }

  // E-mail de boas-vindas com a senha temporária + link de completar
  // cadastro (ver lib/email/). Mesmo fallback de sempre se falhar: a senha
  // continua aparecendo na tela (TutoresAdminSection.tsx).
  const conteudoEmail = emailAcessoTutor({
    nome,
    email,
    senha,
    expiraEm,
    tutorId: tutorCriado.id,
    novoCadastro: true,
  });
  const resultadoEmail = await enviarEmail({
    destinatario: email,
    assunto: conteudoEmail.assunto,
    html: conteudoEmail.html,
    texto: conteudoEmail.texto,
  });

  revalidatePath("/admin/tutores");
  revalidatePath("/tutores");

  return { ok: true, senha, senhaPadrao: padrao, expiraEm, emailEnviado: resultadoEmail.ok };
}

/**
 * Liga o acesso de um tutor que já existe (cadastrado pelo petshop, por
 * exemplo) e gera uma senha de primeiro acesso nova. Serve também pra
 * reemitir a senha de quem deixou o prazo vencer.
 */
export async function liberarAcessoTutor(
  tutorId: string
): Promise<ResultadoAcessoTutor> {
  const admin = await getAdminContext();
  if (!admin) return { ok: false, erro: "Sem permissão de administração." };

  const supabaseAdmin = createAdminClient();

  const { data: tutor, error: erroLeitura } = await supabaseAdmin
    .from("tutores")
    .select("id, nome, email, auth_user_id")
    .eq("id", tutorId)
    .maybeSingle();

  if (erroLeitura || !tutor) return { ok: false, erro: "Tutor não encontrado." };

  if (!tutor.email) {
    return {
      ok: false,
      erro: "Esse tutor não tem e-mail no cadastro — o e-mail é o login dele.",
    };
  }

  const { senha, padrao, expiraEm } = senhaInicialTutor();
  let authUserId = tutor.auth_user_id as string | null;
  // Captura ANTES do bloco abaixo reatribuir authUserId — decide o tom do
  // e-mail (convite de primeiro acesso x senha nova de quem já tinha login).
  const eraPrimeiroAcesso = !authUserId;

  if (authUserId) {
    // Já tem login: só troca a senha por uma provisória nova.
    const { error } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
      password: senha,
    });
    if (error) {
      console.error("Erro ao redefinir senha do tutor:", error);
      return { ok: false, erro: ERRO_GENERICO };
    }
  } else {
    const { data: authData, error } = await supabaseAdmin.auth.admin.createUser({
      email: tutor.email as string,
      password: senha,
      email_confirm: true,
    });
    if (error || !authData.user) {
      console.error("Erro ao criar login do tutor existente:", error);
      return {
        ok: false,
        erro: error?.message.includes("already been registered")
          ? "Esse e-mail já é usado como login no PetClub."
          : ERRO_GENERICO,
      };
    }
    authUserId = authData.user.id;
  }

  const { error: erroFlags } = await supabaseAdmin
    .from("tutores")
    .update({
      auth_user_id: authUserId,
      acesso_liberado: true,
      acesso_liberado_em: new Date().toISOString(),
      senha_provisoria: true,
      senha_provisoria_expira_em: expiraEm,
    })
    .eq("id", tutorId);

  if (erroFlags) {
    console.error("Erro ao liberar acesso do tutor:", erroFlags);
    return { ok: false, erro: ERRO_GENERICO };
  }

  // E-mail com a senha (nova ou de primeiro acesso) + link de completar
  // cadastro — mesmo fallback de sempre se falhar (a senha já aparece na
  // tela). tutor.email já foi conferido não-nulo no início desta função.
  const conteudoEmail = emailAcessoTutor({
    nome: tutor.nome as string,
    email: tutor.email as string,
    senha,
    expiraEm,
    tutorId,
    novoCadastro: eraPrimeiroAcesso,
  });
  const resultadoEmail = await enviarEmail({
    destinatario: tutor.email as string,
    assunto: conteudoEmail.assunto,
    html: conteudoEmail.html,
    texto: conteudoEmail.texto,
  });

  revalidatePath("/admin/tutores");
  return { ok: true, senha, senhaPadrao: padrao, expiraEm, emailEnviado: resultadoEmail.ok };
}

/**
 * Desliga o portal pra esse tutor. O login continua existindo no Auth de
 * propósito: religar depois é um clique, e apagar o usuário quebraria o
 * vínculo com o histórico. auth_tutor_id() já devolve null com a flag
 * desligada, então todas as policies da 0024 fecham juntas.
 */
export async function revogarAcessoTutor(tutorId: string): Promise<ActionResult> {
  const admin = await getAdminContext();
  if (!admin) return { ok: false, erro: "Sem permissão de administração." };

  const supabaseAdmin = createAdminClient();
  const { error, count } = await supabaseAdmin
    .from("tutores")
    .update(
      { acesso_liberado: false, senha_provisoria: false, senha_provisoria_expira_em: null },
      { count: "exact" }
    )
    .eq("id", tutorId);

  if (error) {
    console.error("Erro ao revogar acesso do tutor:", error);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!count) return { ok: false, erro: "Tutor não encontrado." };

  revalidatePath("/admin/tutores");
  return { ok: true };
}

// ----------------------------------------------------------------------------
// EQUIPE DO PETSHOP (usuarios_petshop) — reset de senha
//
// Pedido do Eduardo (31/ago): a administração precisa de flexibilidade pra
// resetar a senha de QUALQUER usuário quando necessário — não só do tutor,
// também de quem acessa o painel do petshop (dono ou atendente). Antes
// desta action não existia nenhum jeito de trocar a senha de alguém depois
// que a conta já tinha sido criada — criarPetshopComDono só define a senha
// na hora em que o petshop nasce, e depois disso não havia botão nenhum.
//
// Mesmo padrão de segurança das actions de tutor acima: service role
// porque updateUserById() não existe com anon key, e getAdminContext() no
// topo é a ÚNICA barreira (regra 4 de lib/supabase/admin.ts). Diferente de
// tutores (que ganhou a policy "leitura_admin_plataforma" na 0024),
// usuarios_petshop não tem NENHUMA policy de leitura pra admin — então a
// leitura abaixo também depende só do service role, não da RLS.
// ----------------------------------------------------------------------------

export type ResultadoResetSenhaUsuario =
  | { ok: true; nome: string; email: string; senha: string; emailEnviado: boolean }
  | { ok: false; erro: string };

export async function resetarSenhaUsuarioPetshop(
  usuarioId: string
): Promise<ResultadoResetSenhaUsuario> {
  const admin = await getAdminContext();
  if (!admin) return { ok: false, erro: "Sem permissão de administração." };

  const supabaseAdmin = createAdminClient();

  const { data: usuario, error: erroLeitura } = await supabaseAdmin
    .from("usuarios_petshop")
    .select("id, auth_user_id, nome, petshop_id")
    .eq("id", usuarioId)
    .maybeSingle();

  if (erroLeitura || !usuario) {
    return { ok: false, erro: "Usuário não encontrado." };
  }

  const senha = gerarSenhaTemporaria();

  const { data: authData, error: erroSenha } = await supabaseAdmin.auth.admin.updateUserById(
    usuario.auth_user_id,
    { password: senha }
  );

  if (erroSenha || !authData.user) {
    console.error("Erro ao redefinir senha do usuário do petshop:", erroSenha);
    return { ok: false, erro: ERRO_GENERICO };
  }

  const email = authData.user.email ?? "";

  // Nome do petshop só pra deixar o e-mail mais claro — usuarios_petshop
  // não tem policy de leitura pra admin (ver comentário no topo desta
  // seção), então continua indo pelo service role, igual ao resto daqui.
  const { data: petshopDoUsuario } = await supabaseAdmin
    .from("petshops")
    .select("nome")
    .eq("id", usuario.petshop_id)
    .maybeSingle();

  let emailEnviado = false;
  if (email) {
    const conteudoEmail = emailAcessoPetshop({
      nomeUsuario: usuario.nome,
      nomePetshop: petshopDoUsuario?.nome ?? "seu petshop",
      email,
      senha,
      novoCadastro: false,
    });
    const resultadoEmail = await enviarEmail({
      destinatario: email,
      assunto: conteudoEmail.assunto,
      html: conteudoEmail.html,
      texto: conteudoEmail.texto,
    });
    emailEnviado = resultadoEmail.ok;
  }

  return { ok: true, nome: usuario.nome, email, senha, emailEnviado };
}
