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
  Servico,
} from "@/types/database";
import { ServicosSection } from "./ServicosSection";
import { PlanosSection } from "./PlanosSection";

export default async function PlanosPage() {
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
  ] = await Promise.all([
    supabase.from("portes").select("*").order("ordem"),
    supabase.from("categorias_servico").select("*").order("id"),
    supabase.from("servicos").select("*").eq("petshop_id", petshopId).order("criado_em"),
    supabase.from("precos_servico").select("*"),
    supabase.from("planos").select("*").eq("petshop_id", petshopId).order("criado_em"),
    supabase.from("plano_servicos").select("*"),
    supabase.from("plano_precos").select("*"),
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl text-ink-900">Planos & Serviços</h1>
      <p className="mt-1 text-sm text-ink-500">
        Catálogo de serviços, combinações em planos e preço por porte — ver
        docs/regras_padrao_petshop.md, seção 4.
      </p>

      <div className="mt-8 space-y-10">
        <ServicosSection
          petshopId={petshopId}
          portes={(portes as Porte[]) ?? []}
          categorias={(categorias as CategoriaServico[]) ?? []}
          servicos={(servicos as Servico[]) ?? []}
          precos={(precos as PrecoServico[]) ?? []}
        />
        <PlanosSection
          petshopId={petshopId}
          portes={(portes as Porte[]) ?? []}
          categorias={(categorias as CategoriaServico[]) ?? []}
          servicos={(servicos as Servico[]) ?? []}
          planos={(planos as Plano[]) ?? []}
          planoServicos={(planoServicos as PlanoServico[]) ?? []}
          planoPrecos={(planoPrecos as PlanoPreco[]) ?? []}
        />
      </div>
    </div>
  );
}
