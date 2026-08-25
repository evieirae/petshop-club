import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/auth/getAdminContext";
import { createClient } from "@/lib/supabase/server";
import type { LeadSaas } from "@/types/database";
import { LeadsAdminSection } from "./LeadsAdminSection";

// Leads da Home pública (app/page.tsx) — a policy "leitura_admin" de
// leads_saas (0018_leads_saas.sql) já libera o client comum pra quem tem
// auth_admin_plataforma(), sem precisar de service role aqui.
export default async function AdminLeadsPage() {
  const admin = await getAdminContext();
  if (!admin) {
    redirect("/login");
  }

  const supabase = createClient();
  const { data: leads } = await supabase
    .from("leads_saas")
    .select("*")
    .order("criado_em", { ascending: false });

  return (
    <div>
      <h1 className="font-display text-2xl text-ink-900">Leads</h1>
      <p className="mt-1 text-sm text-ink-500">
        Pedidos de cotação feitos na Home — converter em petshop é sempre uma
        ação manual, nunca automática.
      </p>

      <div className="mt-8">
        <LeadsAdminSection leads={(leads as LeadSaas[]) ?? []} />
      </div>
    </div>
  );
}
