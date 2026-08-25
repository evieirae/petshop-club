import { redirect } from "next/navigation";
import { getUsuarioContext } from "@/lib/auth/getContext";
import { createClient } from "@/lib/supabase/server";
import type { Funcionario, Produto, Tutor } from "@/types/database";
import { VendasSection } from "./VendasSection";

// Vendas (20/ago/2026) — tela própria, separada do Catálogo. Era uma aba
// dentro de Produtos até aqui; virou tela porque é a tarefa mais repetida do
// balcão, e porque cadastrar produto e vender produto são trabalhos
// diferentes, feitos por pessoas diferentes em momentos diferentes.
export default async function VendasPage() {
  const contexto = await getUsuarioContext();

  if (!contexto?.petshop?.id) {
    redirect("/login");
  }

  const supabase = createClient();
  const petshopId = contexto.petshop.id;

  const [{ data: produtos }, { data: tutores }, { data: funcionarios }] = await Promise.all([
    supabase.from("produtos").select("*").eq("petshop_id", petshopId).order("nome"),
    supabase.from("tutores").select("*").eq("petshop_id", petshopId).order("nome"),
    // Migration 0016 — só funcionário ativo aparece como vendedor. Quem saiu
    // do petshop continua na tabela (pra não quebrar o histórico de vendas
    // dele), mas não pode receber venda nova.
    supabase
      .from("funcionarios")
      .select("*")
      .eq("petshop_id", petshopId)
      .eq("ativo", true)
      .order("nome"),
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl text-ink-900">Vendas</h1>
      <p className="mt-1 text-sm text-ink-500">
        Venda de balcão — ração, caminha, shampoo, coleira. O cadastro de
        produtos e preços fica no Catálogo.
      </p>

      <div className="mt-8">
        <VendasSection
          petshopId={petshopId}
          produtos={(produtos as Produto[]) ?? []}
          tutores={(tutores as Tutor[]) ?? []}
          funcionarios={(funcionarios as Funcionario[]) ?? []}
          comissaoAtiva={contexto.petshop.comissao_ativa}
        />
      </div>
    </div>
  );
}
