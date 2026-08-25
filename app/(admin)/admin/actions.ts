"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/auth/getAdminContext";
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
): Promise<{ ok: true; senhaTemporaria: string } | { ok: false; erro: string }> {
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

  revalidatePath("/admin/petshops");
  revalidatePath("/admin/leads");
  revalidatePath("/admin");

  return { ok: true, senhaTemporaria };
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
