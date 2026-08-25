import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Cliente com a service_role key — ignora TODAS as policies de RLS.
//
// Dois usos hoje:
//   1. Formulario publico de autopreenchimento de tutor
//      (app/(public)/cadastro/[tutorId], ver docs/regras_padrao_petshop.md
//      secao 6): quem preenche esse formulario nao tem sessao logada (nao e
//      nem um usuario do petshop nem tem como logar), entao a policy
//      "isolamento_petshop" baseada em auth_petshop_id() nunca vai bater.
//   2. Server Actions de app/(admin)/admin (criar petshop + dono novo) —
//      precisam de supabase.auth.admin.createUser(), que so existe com
//      service role (nenhum cliente com anon key consegue criar outro
//      usuario do Supabase Auth).
//
// REGRAS DE USO — leia antes de usar esse cliente em qualquer lugar novo:
//   1. So dentro de Server Actions/Route Handlers das rotas publicas de
//      cadastro OU das actions de app/(admin)/admin. Nunca em codigo que
//      roda no browser (a chave nunca pode chegar no cliente — por isso NAO
//      tem prefixo NEXT_PUBLIC_).
//   2. Toda query feita com esse cliente tem que filtrar explicitamente por
//      id (.eq("id", tutorId)) — como nao ha RLS, um WHERE esquecido vaza/
//      edita a base inteira, nao so um petshop.
//   3. Para qualquer tela autenticada de equipe de petshop, continue usando
//      lib/supabase/server.ts — a seguranca real deve vir da RLS, nao de
//      checagem manual no codigo.
//   4. Para as actions de admin (uso 2 acima): SEMPRE chame
//      getAdminContext() (lib/auth/getAdminContext.ts) ANTES de instanciar
//      esse cliente, e aborte se vier null. Diferente do uso 1 (onde a RLS
//      normal ainda protegeria outras tabelas mesmo que alguem chamasse a
//      action sem devia), aqui NAO EXISTE rede de seguranca nenhuma por
//      baixo — esse check manual e a UNICA barreira contra qualquer pessoa
//      logada criar petshops/usuarios a vontade.
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
