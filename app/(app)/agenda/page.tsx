import { redirect } from "next/navigation";
import { getUsuarioContext } from "@/lib/auth/getContext";
import { createClient } from "@/lib/supabase/server";
import { adicionarDias, dataLocalDeString, inicioDaSemana, paraDataLocal } from "@/lib/semana";
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

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: { data?: string };
}) {
  const contexto = await getUsuarioContext();

  // O layout (app/(app)/layout.tsx) ja bloqueia "sem sessao" e "sem petshop
  // vinculado" antes de renderizar a pagina — mesma garantia extra pro
  // TypeScript usada nas outras paginas.
  if (!contexto?.petshop?.id) {
    redirect("/login");
  }

  const supabase = createClient();
  const petshopId = contexto.petshop.id;
  const expediente = {
    hora_abertura: contexto.petshop.hora_abertura,
    hora_fechamento: contexto.petshop.hora_fechamento,
    hora_inicio_intervalo: contexto.petshop.hora_inicio_intervalo,
    hora_fim_intervalo: contexto.petshop.hora_fim_intervalo,
    intervalo_agendamento_minutos: contexto.petshop.intervalo_agendamento_minutos,
  };

  // ?data= referencia um dia qualquer — a semana exibida é sempre a que
  // contém esse dia (domingo a sábado, ver lib/semana.ts). Sem o parâmetro,
  // cai na semana de hoje. Navegar semana é só trocar esse parâmetro via
  // <Link> (AgendaSection.tsx) — sem mecanismo de fetch novo, o Server
  // Component já re-renderiza com o range certo a cada navegação.
  const diaSelecionado = searchParams.data ?? paraDataLocal(new Date());
  const inicioSemana = inicioDaSemana(diaSelecionado);
  const fimSemanaExclusivo = adicionarDias(inicioSemana, 7);

  // agendamentosAvulsosTodos e assinaturas (sem filtro de data) so entram
  // pra calcular "tutores sem agendamento ainda" — nao pra listar no quadro.
  const [
    { data: agendamentosSemana },
    { data: tutores },
    { data: pets },
    { data: servicos },
    { data: categorias },
    { data: planos },
    { data: assinaturas },
    { data: agendamentosAvulsosTodos },
    { data: lembretesEscalados },
  ] = await Promise.all([
    supabase
      .from("agendamentos")
      .select("*")
      .eq("petshop_id", petshopId)
      .gte("data_hora", dataLocalDeString(inicioSemana).toISOString())
      .lt("data_hora", dataLocalDeString(fimSemanaExclusivo).toISOString())
      .order("data_hora"),
    supabase.from("tutores").select("*").eq("petshop_id", petshopId).order("nome"),
    supabase.from("pets").select("*").eq("petshop_id", petshopId).order("nome"),
    supabase.from("servicos").select("*").eq("petshop_id", petshopId).eq("ativo", true).order("criado_em"),
    supabase.from("categorias_servico").select("*").order("id"),
    supabase.from("planos").select("*").eq("petshop_id", petshopId),
    supabase.from("assinaturas").select("*").eq("petshop_id", petshopId),
    supabase.from("agendamentos").select("tutor_id").eq("petshop_id", petshopId).is("assinatura_id", null),
    // Fase 5: RLS ja restringe isso ao petshop logado via join em
    // agendamentos (ver policy "isolamento_petshop" em
    // supabase/migrations/0005_fase5_lembretes_whatsapp.sql).
    supabase
      .from("lembretes")
      .select("agendamento_id")
      .eq("tipo", "confirmacao_manual_petshop")
      .not("agendamento_id", "is", null),
  ]);

  const tutorIdsComAssinatura = new Set((assinaturas ?? []).map((a) => a.tutor_id));
  const tutorIdsComAvulso = new Set(
    (agendamentosAvulsosTodos ?? []).map((a) => a.tutor_id).filter(Boolean) as string[]
  );
  const tutoresSemAgendamento = (tutores as Tutor[] | null ?? []).filter(
    (t) => !tutorIdsComAssinatura.has(t.id) && !tutorIdsComAvulso.has(t.id)
  );

  // Confirmações escaladas pro petshop (Fase 5) que ainda não foram
  // resolvidas — filtra por status em vez de lembretes.confirmado_em
  // porque a equipe pode resolver clicando "Confirmar"/"Pronto"/"Entregue"
  // direto na Agenda, sem passar pela linha de lembrete de escalonamento.
  const agendamentoIdsEscalados = (lembretesEscalados ?? [])
    .map((l) => l.agendamento_id)
    .filter((id): id is string => !!id);

  let pendenciasConfirmacao: Agendamento[] = [];
  if (agendamentoIdsEscalados.length > 0) {
    const { data } = await supabase
      .from("agendamentos")
      .select("*")
      .in("id", agendamentoIdsEscalados)
      .in("status", ["agendado", "reagendado"])
      .order("data_hora");
    pendenciasConfirmacao = (data as Agendamento[] | null) ?? [];
  }

  return (
    <div>
      <h1 className="font-display text-2xl text-ink-900">Agenda</h1>
      <p className="mt-1 text-sm text-ink-500">
        Visitas da semana, confirmações e o fluxo até a entrega do pet.
      </p>

      <div className="mt-8">
        <AgendaSection
          petshopId={petshopId}
          expediente={expediente}
          diaSelecionado={diaSelecionado}
          inicioSemana={inicioSemana}
          agendamentosSemana={(agendamentosSemana as Agendamento[]) ?? []}
          tutores={(tutores as Tutor[]) ?? []}
          pets={(pets as Pet[]) ?? []}
          servicos={(servicos as Servico[]) ?? []}
          categorias={(categorias as CategoriaServico[]) ?? []}
          planos={(planos as Plano[]) ?? []}
          assinaturas={(assinaturas as Assinatura[]) ?? []}
          tutoresSemAgendamento={tutoresSemAgendamento}
          pendenciasConfirmacao={pendenciasConfirmacao}
        />
      </div>
    </div>
  );
}
