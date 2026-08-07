import { createClient } from "@/lib/supabase/server";
import type { Petshop, UsuarioPetshop } from "@/types/database";

export interface UsuarioContext {
  usuario: UsuarioPetshop;
  petshop: Petshop;
}

/**
 * Resolve quem esta logado e a qual petshop essa pessoa pertence
 * (usuarios_petshop.petshop_id). Espelha a mesma logica de
 * auth_petshop_id() do banco (RLS) — o objetivo aqui e so poder
 * exibir contexto na tela (nome do petshop, papel do usuario), a
 * seguranca de verdade continua sendo a policy de RLS.
 *
 * Retorna null se nao houver sessao. Lanca se a sessao existir mas o
 * usuario ainda nao tiver sido vinculado a nenhum petshop em
 * usuarios_petshop — a UI trata esse caso separadamente (ver
 * app/(app)/layout.tsx) porque significa "acesso pendente", nao "nao
 * autenticado".
 */
export async function getUsuarioContext(): Promise<UsuarioContext | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: usuario, error } = await supabase
    .from("usuarios_petshop")
    .select("*, petshops(*)")
    .eq("auth_user_id", user.id)
    .single();

  if (error || !usuario) {
    return { usuario: null as unknown as UsuarioPetshop, petshop: null as unknown as Petshop };
  }

  const { petshops: petshop, ...usuarioSemPetshop } = usuario as UsuarioPetshop & {
    petshops: Petshop;
  };

  return { usuario: usuarioSemPetshop as UsuarioPetshop, petshop };
}
