import { redirect } from "next/navigation";
import { getUsuarioContext } from "@/lib/auth/getContext";
import { createClient } from "@/lib/supabase/server";
import type { Assinatura, ContatoAdicional, Pet, Plano, Porte, Tutor } from "@/types/database";
import { TutoresSection } from "./TutoresSection";

export default async function TutoresPage() {
  const contexto = await getUsuarioContext();

  // O layout (app/(app)/layout.tsx) ja bloqueia "sem sessao" e "sem petshop
  // vinculado" antes de renderizar a pagina — mesma garantia extra pro
  // TypeScript usada em configuracoes/page.tsx e planos/page.tsx.
  if (!contexto?.petshop?.id) {
    redirect("/login");
  }

  const supabase = createClient();
  const petshopId = contexto.petshop.id;

  // pets e contatos_adicionais nao precisam de .eq("petshop_id", ...) pra
  // ficarem isolados — a policy de RLS (isolamento_petshop) ja filtra, mas o
  // filtro explicito deixa a intencao clara e evita depender só da RLS pra
  // leitura.
  const [
    { data: portes },
    { data: tutores },
    { data: pets },
    { data: contatos },
    { data: planos },
    { data: assinaturas },
  ] = await Promise.all([
    supabase.from("portes").select("*").order("ordem"),
    supabase.from("tutores").select("*").eq("petshop_id", petshopId).order("criado_em"),
    supabase.from("pets").select("*").eq("petshop_id", petshopId).order("criado_em"),
    supabase
      .from("contatos_adicionais")
      .select("*")
      .eq("petshop_id", petshopId)
      .order("criado_em"),
    // Sem filtro de ativo: uma assinatura antiga pode apontar pra um plano
    // já desativado, e o card do pet precisa achar o nome dele mesmo assim
    // (AssinaturaForm.tsx é quem filtra só os ativos, na hora de criar nova).
    supabase.from("planos").select("*").eq("petshop_id", petshopId).order("nome"),
    supabase.from("assinaturas").select("*").eq("petshop_id", petshopId).order("criado_em"),
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl text-ink-900">Tutores & Pets</h1>
      <p className="mt-1 text-sm text-ink-500">
        Cadastro, contatos por papel e link de autopreenchimento — ver
        docs/regras_padrao_petshop.md, seção 6.
      </p>

      <div className="mt-8">
        <TutoresSection
          petshopId={petshopId}
          portes={(portes as Porte[]) ?? []}
          tutores={(tutores as Tutor[]) ?? []}
          pets={(pets as Pet[]) ?? []}
          contatosAdicionais={(contatos as ContatoAdicional[]) ?? []}
          planos={(planos as Plano[]) ?? []}
          assinaturas={(assinaturas as Assinatura[]) ?? []}
        />
      </div>
    </div>
  );
}
