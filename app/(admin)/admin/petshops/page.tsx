import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/auth/getAdminContext";
import { createClient } from "@/lib/supabase/server";
import type { Petshop } from "@/types/database";
import { PetshopsAdminSection } from "./PetshopsAdminSection";

// Taxas da plataforma + status (congelar/encerrar) + cadastro de petshop
// novo. Movida de app/(app)/admin (ver 0017_admin_plataforma_independente.sql) —
// esta área não pertence a nenhum petshop, então vive fora do grupo (app).
export default async function AdminPetshopsPage() {
  const admin = await getAdminContext();
  if (!admin) {
    redirect("/login");
  }

  // A policy de `petshops` (0002_admin_plataforma.sql, ajustada em 0017)
  // já libera SELECT/UPDATE de qualquer linha pra quem tem
  // auth_admin_plataforma() — o client comum (com RLS) já basta aqui, sem
  // precisar de service role.
  const supabase = createClient();
  const { data: petshops } = await supabase.from("petshops").select("*").order("nome");

  return (
    <div>
      <h1 className="font-display text-2xl text-ink-900">Petshops</h1>
      <p className="mt-1 text-sm text-ink-500">
        Taxas da plataforma, status da conta e cadastro de petshop novo — ver
        docs/regras_padrao_petshop.md, seção 3.
      </p>

      <div className="mt-8">
        <PetshopsAdminSection petshops={(petshops as Petshop[]) ?? []} />
      </div>
    </div>
  );
}
