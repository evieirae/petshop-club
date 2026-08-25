import { redirect } from "next/navigation";
import { getUsuarioContext } from "@/lib/auth/getContext";
import { createClient } from "@/lib/supabase/server";
import type {
  CategoriaServico,
  Plano,
  PlanoPreco,
  PlanoServico,
  Porte,
  PrecoServico,
  Produto,
  Servico,
} from "@/types/database";
import { CatalogoTabs } from "./CatalogoTabs";
import { ServicosSection } from "./ServicosSection";
import { PlanosSection } from "./PlanosSection";
import { ProdutosSection } from "./ProdutosSection";

// Catálogo (20/ago/2026) — junta numa tela só tudo que o petshop cadastra
// pra ganhar dinheiro: serviço avulso, plano recorrente e produto. Antes
// eram duas telas ("Planos & Serviços" e "Produtos"), e a de Produtos ainda
// misturava catálogo com ponto de venda. Pedido do Eduardo: "uma aba só pra
// cadastro de qualquer coisa que gere dinheiro ao Pet, e uma aba separada
// pra cobrança/venda" (esta última é app/(app)/vendas).
export default async function CatalogoPage() {
  const contexto = await getUsuarioContext();

  // O layout (app/(app)/layout.tsx) ja bloqueia "sem sessao" e "sem petshop
  // vinculado" antes de renderizar a pagina — isso aqui e so uma garantia
  // extra pro TypeScript, mesmo padrao usado em configuracoes/page.tsx.
  if (!contexto?.petshop?.id) {
    redirect("/login");
  }

  const supabase = createClient();
  const petshopId = contexto.petshop.id;

  // precos_servico, plano_servicos e plano_precos nao tem petshop_id direto
  // — a policy de RLS (isolamento_petshop) ja filtra via servico_id/plano_id,
  // entao o select sem .eq() aqui so traz o que e desse petshop mesmo assim.
  const [
    { data: portes },
    { data: categorias },
    { data: servicos },
    { data: precos },
    { data: planos },
    { data: planoServicos },
    { data: planoPrecos },
    { data: produtos },
  ] = await Promise.all([
    supabase.from("portes").select("*").order("ordem"),
    supabase.from("categorias_servico").select("*").order("id"),
    supabase.from("servicos").select("*").eq("petshop_id", petshopId).order("criado_em"),
    supabase.from("precos_servico").select("*"),
    supabase.from("planos").select("*").eq("petshop_id", petshopId).order("criado_em"),
    supabase.from("plano_servicos").select("*"),
    supabase.from("plano_precos").select("*"),
    supabase.from("produtos").select("*").eq("petshop_id", petshopId).order("nome"),
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl text-ink-900">Catálogo</h1>
      <p className="mt-1 text-sm text-ink-500">
        Tudo que o petshop vende: serviços e seus preços por porte, planos
        recorrentes e produtos de prateleira. Registrar uma venda é na tela de
        Vendas.
      </p>

      <div className="mt-8">
        <CatalogoTabs
          servicos={
            <ServicosSection
              petshopId={petshopId}
              portes={(portes as Porte[]) ?? []}
              categorias={(categorias as CategoriaServico[]) ?? []}
              servicos={(servicos as Servico[]) ?? []}
              precos={(precos as PrecoServico[]) ?? []}
            />
          }
          planos={
            <PlanosSection
              petshopId={petshopId}
              portes={(portes as Porte[]) ?? []}
              categorias={(categorias as CategoriaServico[]) ?? []}
              servicos={(servicos as Servico[]) ?? []}
              planos={(planos as Plano[]) ?? []}
              planoServicos={(planoServicos as PlanoServico[]) ?? []}
              planoPrecos={(planoPrecos as PlanoPreco[]) ?? []}
            />
          }
          produtos={
            <ProdutosSection petshopId={petshopId} produtos={(produtos as Produto[]) ?? []} />
          }
        />
      </div>
    </div>
  );
}
