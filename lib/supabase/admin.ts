import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Cliente com a service_role key — ignora TODAS as policies de RLS.
//
// So existe por causa do formulario publico de autopreenchimento de tutor
// (app/(public)/cadastro/[tutorId], ver docs/regras_padrao_petshop.md secao
// 6): quem preenche esse formulario nao tem sessao logada (nao e nem um
// usuario do petshop nem tem como logar), entao a policy "isolamento_petshop"
// baseada em auth_petshop_id() nunca vai bater. Sem esse cliente, o tutor
// nao consegue completar o proprio cadastro.
//
// REGRAS DE USO — leia antes de usar esse cliente em qualquer lugar novo:
//   1. So dentro de Server Actions/Route Handlers da rota publica de
//      cadastro. Nunca em codigo que roda no browser (a chave nunca pode
//      chegar no cliente — por isso NAO tem prefixo NEXT_PUBLIC_).
//   2. Toda query feita com esse cliente tem que filtrar explicitamente por
//      id (.eq("id", tutorId)) — como nao ha RLS, um WHERE esquecido vaza/
//      edita a base inteira, nao so um petshop.
//   3. Para qualquer tela autenticada (equipe do petshop), continue usando
//      lib/supabase/server.ts — a seguranca real deve vir da RLS, nao de
//      checagem manual no codigo.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (ou NEXT_PUBLIC_SUPABASE_URL) nao configurada — " +
        "veja .env.example."
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
