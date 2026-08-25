import { createClient } from "@/lib/supabase/server";
import type { AdminPlataforma } from "@/types/database";

/**
 * Espelha getUsuarioContext(), mas resolve a OUTRA identidade possível de
 * quem está logado: admin da plataforma (supabase/migrations/0017_admin_plataforma_independente.sql),
 * independente de petshop. Fica separado de propósito — são conceitos
 * diferentes, e uma mesma pessoa pode ter as duas (equipe de um petshop via
 * usuarios_petshop E admin da plataforma via admins_plataforma).
 *
 * Retorna null se não houver sessão, ou se a sessão existir mas não tiver
 * linha em admins_plataforma (a pessoa está logada, só não é admin).
 */
export async function getAdminContext(): Promise<AdminPlataforma | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: admin } = await supabase
    .from("admins_plataforma")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();

  return (admin as AdminPlataforma) ?? null;
}
