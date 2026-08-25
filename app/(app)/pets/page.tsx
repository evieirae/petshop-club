import { redirect } from "next/navigation";
import { getUsuarioContext } from "@/lib/auth/getContext";
import { createClient } from "@/lib/supabase/server";
import type { Agendamento, Assinatura, Pet, Porte, Tutor } from "@/types/database";
import { resolverAgendamento } from "@/lib/agenda/resolver";
import { PetsSection } from "./PetsSection";

// Fase 4 (pedido de 18/ago/2026 — "cadastro pela plataforma do Pet"): nova
// tela principal de cadastro, pet-first. app/(app)/tutores/ continua
// existindo, sem mudar de papel — é onde fica o que é dado do TUTOR
// (endereço, e-mail, link de autopreenchimento, contato adicional, forma de
// pagamento) e onde a assinatura de cada pet é gerenciada. Nenhuma migration
// nova aqui: pets.tutor_id já modela exatamente essa relação.
export default async function PetsPage() {
  const contexto = await getUsuarioContext();

  // O layout (app/(app)/layout.tsx) ja bloqueia "sem sessao" e "sem petshop
  // vinculado" antes de renderizar a pagina — mesma garantia extra pro
  // TypeScript usada em configuracoes/page.tsx, planos/page.tsx e tutores/page.tsx.
  if (!contexto?.petshop?.id) {
    redirect("/login");
  }

  const supabase = createClient();
  const petshopId = contexto.petshop.id;

  const [{ data: portes }, { data: tutores }, { data: pets }, { data: assinaturas }, { data: agendamentosEntregues }] =
    await Promise.all([
      supabase.from("portes").select("*").order("ordem"),
      supabase.from("tutores").select("*").eq("petshop_id", petshopId).order("nome"),
      supabase.from("pets").select("*").eq("petshop_id", petshopId).order("criado_em"),
      supabase.from("assinaturas").select("*").eq("petshop_id", petshopId),
      // "Última visita" (pedido de 20/ago/2026) só conta visita CONCLUÍDA —
      // ordenado mais recente primeiro, pra pegar só a 1ª ocorrência por pet
      // no reduce abaixo.
      supabase
        .from("agendamentos")
        .select("*")
        .eq("petshop_id", petshopId)
        .eq("status", "entregue")
        .order("data_hora", { ascending: false }),
    ]);

  // Visita de assinatura não tem pet_id direto (só assinatura_id) — reusa a
  // mesma ramificação de lib/agenda/resolver.ts (já usada em
  // painel/page.tsx e AgendaSection.tsx) em vez de duplicar a lógica.
  // servicos/categorias/planos ficam vazios de propósito: resolverAgendamento
  // só precisa deles pra montar `rotulo`, que esta tela não usa — passar
  // array vazio evita 3 queries que não serviriam pra nada aqui.
  const ultimaVisitaPorPet: Record<string, string> = {};
  for (const agendamento of (agendamentosEntregues as Agendamento[] | null) ?? []) {
    const { pet } = resolverAgendamento(agendamento, {
      tutores: (tutores as Tutor[]) ?? [],
      pets: (pets as Pet[]) ?? [],
      servicos: [],
      categorias: [],
      planos: [],
      assinaturas: (assinaturas as Assinatura[]) ?? [],
    });
    if (pet && !(pet.id in ultimaVisitaPorPet)) {
      ultimaVisitaPorPet[pet.id] = agendamento.data_hora;
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl text-ink-900">Pets</h1>
      <p className="mt-1 text-sm text-ink-500">
        Cadastro pelo pet — o tutor é vinculado no mesmo fluxo. Dados do
        tutor (endereço, link de cadastro, forma de pagamento) e assinaturas
        continuam em Tutores.
      </p>

      <div className="mt-8">
        <PetsSection
          petshopId={petshopId}
          portes={(portes as Porte[]) ?? []}
          tutores={(tutores as Tutor[]) ?? []}
          pets={(pets as Pet[]) ?? []}
          ultimaVisitaPorPet={ultimaVisitaPorPet}
        />
      </div>
    </div>
  );
}
