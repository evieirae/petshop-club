"use server";

import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; erro: string };

// Formulário de cotação da Home pública (app/page.tsx). Quem preenche não
// tem sessão nenhuma — funciona porque leads_saas tem uma policy de INSERT
// liberada pro papel `anon` (ver supabase/migrations/0018_leads_saas.sql),
// então o client comum (lib/supabase/server.ts) já basta, sem precisar do
// createAdminClient() de service role.
//
// NUNCA cria petshop — só registra o pedido. Virar petshop de verdade é
// sempre uma ação manual do admin da plataforma, em /admin/leads
// (app/(admin)/admin/actions.ts, criarPetshopComDono).
export type LeadInput = {
  nomePetshop: string;
  nomeResponsavel: string;
  email: string;
  telefone: string;
  mensagem: string;
};

export async function criarLead(dados: LeadInput): Promise<ActionResult> {
  const email = dados.email.trim();
  if (!email) {
    return { ok: false, erro: "Informe um e-mail pra receber a cotação." };
  }

  const supabase = createClient();
  const { error } = await supabase.from("leads_saas").insert({
    nome_petshop: dados.nomePetshop.trim() || null,
    nome_responsavel: dados.nomeResponsavel.trim() || null,
    email,
    telefone: dados.telefone.trim() || null,
    mensagem: dados.mensagem.trim() || null,
  });

  if (error) {
    console.error("Erro ao registrar lead:", error);
    return { ok: false, erro: "Não deu pra enviar. Tenta de novo em alguns segundos." };
  }

  return { ok: true };
}
