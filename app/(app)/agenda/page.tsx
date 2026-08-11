import { redirect } from "next/navigation";
import { getUsuarioContext } from "@/lib/auth/getContext";
import { createClient } from "@/lib/supabase/server";
import type {
  Agendamento,
  Assinatura,
  CategoriaServico,
  Pet,
  Plano,
  Servico,
  Tutor,
} from "@/types/database";
import { AgendaSection } from "./AgendaSection";

export default async function AgendaPage() {
  const contexto = await getUsuarioContext();

  // O layout (app/(app)/layout.tsx) ja bloqueia "sem sessao" e "sem petshop
  // vinculado" antes de renderizar a pagina — mesma garantia extra pro
  // TypeScript usada nas outras paginas.
  if (!contexto?.petshop?.id) {
    redirect("/login");
  }

  const supabase = createClient();
  const petshopId = contexto.petshop.id;

  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);
  const fimHoje = new Date(inicioHoje);
  fimHoje.setDate(fimHoje.getDate() + 1);

  // agendamentosAvulsosTodos e assinaturas (sem filtro de data) so entram
  // pra calcular "tutores sem agendamento ainda" — nao pra listar na tela.
  const [
    { data: agendamentosHoje },
    { data: tutores },
    { data: pets },
    { data: servicos },
    { data: categorias },
    { data: planos },
    { data: assinaturas },
    { data: agendamentosAvulsosTodos },
  ] = await Promise.all([
    supabase
      .from("agendamentos")
      .select("*")
      .eq("petshop_id", petshopId)
      .gte("data_hora", inicioHoje.toISOString())
      .lt("data_hora", fimHoje.toISOString())
      .order("data_hora"),
    supabase.from("tutores").select("*").eq("petshop_id", petshopId).order("nome"),
    supabase.from("pets").select("*").eq("petshop_id", petshopId).order("nome"),
    supabase.from("servicos").select("*").eq("petshop_id", petshopId).eq("ativo", true).order("criado_em"),
    supabase.from("categorias_servico").select("*").order("id"),
    supabase.from("planos").select("*").eq("petshop_id", petshopId),
    supabase.from("assinaturas").select("*").eq("petshop_id", petshopId),
    supabase.from("agendamentos").select("tutor_id").eq("petshop_id", petshopId).is("assinatura_id", null),
  ]);

  const tutorIdsComAssinatura = new Set((assinaturas ?? []).map((a) => a.tutor_id));
  const tutorIdsComAvulso = new Set(
    (agendamentosAvulsosTodos ?? []).map((a) => a.tutor_id).filter(Boolean) as string[]
  );
  const tutoresSemAgendamento = (tutores as Tutor[] | null ?? []).filter(
    (t) => !tutorIdsComAssinatura.has(t.id) && !tutorIdsComAvulso.has(t.id)
  );

  return (
    <div>
      <h1 className="font-display text-2xl text-ink-900">Agenda</h1>
      <p className="mt-1 text-sm text-ink-500">
        Visitas do dia, confirmações e o fluxo até a entrega do pet.
      </p>

      <div className="mt-8">
        <AgendaSection
          petshopId={petshopId}
          agendamentosHoje={(agendamentosHoje as Agendamento[]) ?? []}
          tutores={(tutores as Tutor[]) ?? []}
          pets={(pets as Pet[]) ?? []}
          servicos={(servicos as Servico[]) ?? []}
          categorias={(categorias as CategoriaServico[]) ?? []}
          planos={(planos as Plano[]) ?? []}
          assinaturas={(assinaturas as Assinatura[]) ?? []}
          tutoresSemAgendamento={tutoresSemAgendamento}
        />
      </div>
    </div>
  );
}
