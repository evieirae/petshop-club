import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/auth/getAdminContext";
import { createClient } from "@/lib/supabase/server";
import type { Petshop, Tutor } from "@/types/database";
import { TutoresAdminSection } from "./TutoresAdminSection";

// Cadastro de tutor pela administração da plataforma, escolhendo o petshop —
// o mesmo papel de "administrador de rede" que já existe pra petshops e
// leads. O petshop continua cadastrando os próprios tutores em /tutores;
// esta tela é o atalho de quem enxerga a rede inteira.
//
// A leitura usa o client comum: a policy "leitura_admin_plataforma" de
// `tutores` (0024) já libera SELECT de qualquer petshop pra quem tem
// auth_admin_plataforma(). Só a escrita precisa de service role, e ela mora
// nas actions.
export default async function AdminTutoresPage() {
  const admin = await getAdminContext();
  if (!admin) {
    redirect("/login");
  }

  const supabase = createClient();
  const [{ data: petshops }, { data: tutores }] = await Promise.all([
    supabase.from("petshops").select("*").order("nome"),
    supabase.from("tutores").select("*").order("criado_em", { ascending: false }),
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl text-ink-900">Tutores</h1>
      <p className="mt-1 text-sm text-ink-500">
        Cadastre um tutor em qualquer petshop da rede e transforme o e-mail
        dele num acesso ao portal (/minha-conta).
      </p>

      <div className="mt-8">
        <TutoresAdminSection
          petshops={(petshops as Petshop[]) ?? []}
          tutores={(tutores as Tutor[]) ?? []}
        />
      </div>
    </div>
  );
}
