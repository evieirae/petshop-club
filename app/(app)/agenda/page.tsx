import { redirect } from "next/navigation";
import { getUsuarioContext } from "@/lib/auth/getContext";
import { createClient } from "@/lib/supabase/server";
import {
  adicionarDias,
  dataLocalDeString,
  inicioDaSemana,
  inicioDoMes,
  inicioDoMesSeguinte,
  paraDataLocal,
  type Visao,
} from "@/lib/semana";
import type {
  Agendamento,
  Assinatura,
  CategoriaServico,
  Funcionario,
  Pet,
  Plano,
  Servico,
  Tutor,
} from "@/types/database";
import { texto } from "@/lib/ui/styles";
import { AgendaSection } from "./AgendaSection";
import { PedidosSection } from "./PedidosSection";

// Fase 1 de docs/plano-calendario-agenda-reui.md — a visão (Mês/Semana/Dia)
// vira parâmetro de URL, do mesmo jeito que `data` já é hoje (tipo `Visao`
// compartilhado com AgendaSection.tsx via lib/semana.ts). A partir da Fase
// 5 já existe UI pra trocar de visão e telas de Mês/Dia — esta função só
// garante que a busca traz o intervalo certo pra cada uma.
export default async function AgendaPage({
  searchParams,
}: {
  searchParams: { data?: string; visao?: string };
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
  const visao: Visao =
    searchParams.visao === "mes" || searchParams.visao === "dia" ? searchParams.visao : "semana";
  const inicioSemana = inicioDaSemana(diaSelecionado);
  const fimSemanaExclusivo = adicionarDias(inicioSemana, 7);

  // Intervalo de busca do quadro: dia único, semana (comportamento de hoje,
  // inclusive quando `visao` está ausente) ou o mês corrente de
  // `diaSelecionado`. Deliberadamente não busca os dias esmaecidos de
  // meses vizinhos que aparecem na grade do Mês — ver seção 2 do plano.
  const inicioIntervalo =
    visao === "dia" ? diaSelecionado : visao === "mes" ? inicioDoMes(diaSelecionado) : inicioSemana;
  const fimIntervaloExclusivo =
    visao === "dia"
      ? adicionarDias(diaSelecionado, 1)
      : visao === "mes"
        ? inicioDoMesSeguinte(diaSelecionado)
        : fimSemanaExclusivo;

  // agendamentosAvulsosTodos e assinaturas (sem filtro de data) so entram
  // pra calcular "tutores sem agendamento ainda" — nao pra listar no quadro.
  const [
    { data: agendamentosPeriodo },
    { data: tutores },
    { data: pets },
    { data: servicos },
    { data: categorias },
    { data: planos },
    { data: assinaturas },
    { data: agendamentosAvulsosTodos },
    { data: lembretesEscalados },
    { data: funcionarios },
    { data: historicoFaltaRows },
  ] = await Promise.all([
    supabase
      .from("agendamentos")
      .select("*")
      .eq("petshop_id", petshopId)
      .gte("data_hora", dataLocalDeString(inicioIntervalo).toISOString())
      .lt("data_hora", dataLocalDeString(fimIntervaloExclusivo).toISOString())
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
    // Migration 0016 — quem pode ser marcado como responsável pela visita.
    // Só ativos: quem saiu do petshop continua nas visitas antigas, mas não
    // entra em visita nova.
    supabase
      .from("funcionarios")
      .select("*")
      .eq("petshop_id", petshopId)
      .eq("ativo", true)
      .order("nome"),
    // Migration 0023 — histórico de falta por tutor. Só quem já merece
    // atenção: 'ok' e 'sem_historico' não viram selo, então nem sobem.
    supabase
      .from("historico_falta_tutor")
      .select("tutor_id, nivel, faltas_janela, janela_considerada")
      .eq("petshop_id", petshopId)
      .in("nivel", ["atencao", "alto"]),
  ]);

  const historicoFalta = Object.fromEntries(
    (historicoFaltaRows ?? []).map((h) => [h.tutor_id, h])
  );

  // Migration 0025 — pedidos que o tutor mandou pelo portal e ninguém
  // respondeu. Consulta própria, fora do range da semana de propósito: um
  // pedido pra daqui a três semanas não pode ficar invisível só porque a
  // tela está mostrando esta semana.
  const { data: pedidosPendentes } = await supabase
    .from("agendamentos")
    .select("*")
    .eq("petshop_id", petshopId)
    .eq("status", "solicitado")
    .order("data_hora");

  const tutorIdsComAssinatura = new Set((assinaturas ?? []).map((a) => a.tutor_id));
  const tutorIdsComAvulso = new Set(
    (agendamentosAvulsosTodos ?? []).map((a) => a.tutor_id).filter(Boolean) as string[]
  );
  // Migration 0019 (soft-delete) — tutor desativado não entra nesse
  // atalho de "candidato a contato": ele já não é mais atendido, então não
  // faz sentido convidar a equipe a agendar a primeira visita dele.
  const tutoresSemAgendamento = (tutores as Tutor[] | null ?? []).filter(
    (t) => t.ativo && !tutorIdsComAssinatura.has(t.id) && !tutorIdsComAvulso.has(t.id)
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
      <h1 className={texto.tituloPagina}>Agenda</h1>
      <p className={texto.subtitulo}>
        Visitas da semana, confirmações e o fluxo até a entrega do pet.
      </p>

      <div className="mt-8">
        <PedidosSection
          pedidos={(pedidosPendentes as Agendamento[]) ?? []}
          tutores={(tutores as Tutor[]) ?? []}
          pets={(pets as Pet[]) ?? []}
          servicos={(servicos as Servico[]) ?? []}
          categorias={(categorias as CategoriaServico[]) ?? []}
        />

        <AgendaSection
          petshopId={petshopId}
          expediente={expediente}
          visao={visao}
          diaSelecionado={diaSelecionado}
          inicioSemana={inicioSemana}
          agendamentosSemana={(agendamentosPeriodo as Agendamento[]) ?? []}
          tutores={(tutores as Tutor[]) ?? []}
          pets={(pets as Pet[]) ?? []}
          servicos={(servicos as Servico[]) ?? []}
          categorias={(categorias as CategoriaServico[]) ?? []}
          planos={(planos as Plano[]) ?? []}
          assinaturas={(assinaturas as Assinatura[]) ?? []}
          tutoresSemAgendamento={tutoresSemAgendamento}
          pendenciasConfirmacao={pendenciasConfirmacao}
          funcionarios={(funcionarios as Funcionario[]) ?? []}
          historicoFalta={historicoFalta}
        />
      </div>
    </div>
  );
}
