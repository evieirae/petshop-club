import { redirect } from "next/navigation";
import { getUsuarioContext } from "@/lib/auth/getContext";
import { createClient } from "@/lib/supabase/server";
import type { Petshop } from "@/types/database";
import { AdminPetshopsSection } from "./AdminPetshopsSection";

// Area restrita a quem tem usuarios_petshop.eh_admin_plataforma=true (ver
// supabase/migrations/0002_admin_plataforma.sql). Diferente do resto de
// app/(app), aqui a pagina enxerga TODOS os petshops, nao so o do usuario
// logado — a RLS de `petshops` permite isso especificamente pra admin.
export default async function AdminPage() {
  const contexto = await getUsuarioContext();

  if (!contexto?.petshop?.id) {
    redirect("/login");
  }

  // Guard de verdade continua sendo a RLS (um usuario comum que cair aqui
  // direto pela URL so consegue ver/editar o proprio petshop mesmo assim),
  // mas nem faz sentido mostrar a tela — redireciona pra visao geral.
  if (!contexto.usuario?.eh_admin_plataforma) {
    redirect("/");
  }

  const supabase = createClient();
  const { data: petshops } = await supabase
    .from("petshops")
    .select("*")
    .order("nome");

  return (
    <div>
      <h1 className="font-display text-2xl text-ink-900">Administração</h1>
      <p className="mt-1 text-sm text-ink-500">
        Taxas da plataforma por petshop — só quem administra a plataforma
        edita isso (ver docs/regras_padrao_petshop.md, seção 3). Os petshops
        só visualizam o próprio valor, em Configurações.
      </p>

      <div className="mt-8">
        <AdminPetshopsSection petshops={(petshops as Petshop[]) ?? []} />
      </div>
    </div>
  );
}
