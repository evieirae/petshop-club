import { CalendarCheck, PawPrint, Repeat, Settings } from "lucide-react";
import { redirect } from "next/navigation";
import { getUsuarioContext } from "@/lib/auth/getContext";
import { createClient } from "@/lib/supabase/server";
import { NavCard } from "@/components/ui/NavCard";
import { texto } from "@/lib/ui/styles";
import { adicionarDias, dataLocalDeString, paraDataLocal } from "@/lib/semana";
import { resolverAgendamento, type ContextoNomes } from "@/lib/agenda/resolver";
import type {
  Agendamento,
  Assinatura,
  CategoriaServico,
  Pet,
  Plano,
  Servico,
  Tutor,
} from "@/types/database";
import { VisitasDoDiaSection } from "../VisitasDoDiaSection";

// Pedido de 18/ago/2026: a Visão Geral ganhou duas seções novas.
//
//  1. "Visitas de hoje" — quadro de botões horizontais (VisitasDoDiaSection,
//     Client Component) com um botão por pet, no horário marcado, que
//     avança pronto -> entregue e dispara o WhatsApp correspondente. Os
//     dados são resolvidos aqui (Server Component) com o mesmo
//     resolverAgendamento() que a Agenda usa — ver lib/agenda/resolver.ts.
//  2. "Este mês" — KPIs de contagem (pets, tutores, assinaturas ativas,
//     visitas, novos cadastros, taxa de comparecimento). Deliberadamente
//     sem números financeiros — isso já é o assunto de /financeiro; aqui é
//     só volume/cadastro, pra não duplicar a mesma informação em dois
//     lugares com riscos de ficarem incoerentes entre si.
//
// Movida de app/(app)/page.tsx pra app/(app)/painel/page.tsx em 20/ago/2026
// (pedido do Eduardo): "/" virou a Home institucional pública
// (app/page.tsx) — o painel logado precisou de um endereço próprio. Ver
// supabase/migrations/0017_admin_plataforma_independente.sql.
export default async function VisaoGeralPage() {
  const contexto = await getUsuarioContext();
  const primeiroNome = contexto?.usuario?.nome?.split(" ")[0] ?? "";

  // O layout (app/(app)/layout.tsx) já bloqueia "sem sessão" e "sem petshop
  // vinculado" antes de renderizar a página — mesma garantia extra pro
  // TypeScript usada nas outras páginas (ver app/(app)/agenda/page.tsx).
  if (!contexto?.petshop?.id) {
    redirect("/login");
  }

  const supabase = createClient();
  const petshopId = contexto.petshop.id;

  // Ranges de data em componentes LOCAIS, nunca .toISOString().slice(0,10)
  // (mesma cautela de lib/semana.ts e app/(app)/agenda/page.tsx — UTC
  // desloca o dia à noite no fuso do Brasil). "Hoje" pro quadro de visitas,
  // mês corrente pros KPIs.
  const hojeISO = paraDataLocal(new Date());
  const amanhaISO = adicionarDias(hojeISO, 1);
  const [ano, mes] = hojeISO.split("-").map(Number);
  const inicioMesISO = paraDataLocal(new Date(ano, mes - 1, 1));
  const inicioProximoMesISO = paraDataLocal(new Date(ano, mes, 1));

  const [
    { data: agendamentosHoje },
    { data: tutores },
    { data: pets },
    { data: servicos },
    { data: categorias },
    { data: planos },
    { data: assinaturas },
    { data: agendamentosMes },
  ] = await Promise.all([
    supabase
      .from("agendamentos")
      .select("*")
      .eq("petshop_id", petshopId)
      .gte("data_hora", dataLocalDeString(hojeISO).toISOString())
      .lt("data_hora", dataLocalDeString(amanhaISO).toISOString())
      .order("data_hora"),
    supabase.from("tutores").select("*").eq("petshop_id", petshopId).order("nome"),
    supabase.from("pets").select("*").eq("petshop_id", petshopId).order("nome"),
    supabase.from("servicos").select("*").eq("petshop_id", petshopId).eq("ativo", true).order("criado_em"),
    supabase.from("categorias_servico").select("*").order("id"),
    supabase.from("planos").select("*").eq("petshop_id", petshopId),
    supabase.from("assinaturas").select("*").eq("petshop_id", petshopId),
    // Só recorte que "todos os pets/tutores/assinaturas" (já buscados acima
    // pros KPIs de contagem total) não cobre — status por visita do mês.
    supabase
      .from("agendamentos")
      .select("status")
      .eq("petshop_id", petshopId)
      .gte("data_hora", dataLocalDeString(inicioMesISO).toISOString())
      .lt("data_hora", dataLocalDeString(inicioProximoMesISO).toISOString()),
  ]);

  const ctx: ContextoNomes = {
    tutores: (tutores as Tutor[]) ?? [],
    pets: (pets as Pet[]) ?? [],
    servicos: (servicos as Servico[]) ?? [],
    categorias: (categorias as CategoriaServico[]) ?? [],
    planos: (planos as Plano[]) ?? [],
    assinaturas: (assinaturas as Assinatura[]) ?? [],
  };
  const visitasHoje = ((agendamentosHoje as Agendamento[] | null) ?? []).map((a) =>
    resolverAgendamento(a, ctx)
  );

  // KPIs derivados dos arrays que já vieram acima (pets/tutores/assinaturas
  // são buscados inteiros, sem filtro de data, pra resolver nomes no quadro
  // de hoje) — evita multiplicar consultas só pra contar linha. Só
  // "agendamentosMes" precisou de query própria: é o único recorte que nem
  // "hoje" nem "tudo" cobrem.
  //
  // "Pets"/"Tutores cadastrados" contam TODOS (ativo e inativo — migration
  // 0019) de propósito: é um número histórico de cadastro, não "quem está
  // ativo agora". As listas/pickers operacionais é que filtram ativo=true.
  const totalPets = ctx.pets.length;
  const totalTutores = ctx.tutores.length;
  const assinaturasAtivas = ctx.assinaturas.filter((a) => a.status === "ativa").length;

  const inicioMesDate = dataLocalDeString(inicioMesISO);
  const inicioProximoMesDate = dataLocalDeString(inicioProximoMesISO);
  const novosPetsNoMes = ctx.pets.filter((p) => {
    const criadoEm = new Date(p.criado_em);
    return criadoEm >= inicioMesDate && criadoEm < inicioProximoMesDate;
  }).length;

  const visitasNoMes = agendamentosMes?.length ?? 0;
  const entreguesNoMes = (agendamentosMes ?? []).filter((a) => a.status === "entregue").length;
  const faltasNoMes = (agendamentosMes ?? []).filter((a) => a.status === "faltou").length;
  const baseComparecimento = entreguesNoMes + faltasNoMes;
  // Só entre visitas já resolvidas (entregue/faltou) — a maioria do mês
  // ainda em aberto (agendado/confirmado/pronto) não deveria puxar a taxa
  // pra baixo só por ainda não ter acontecido.
  const taxaComparecimento =
    baseComparecimento > 0 ? Math.round((entreguesNoMes / baseComparecimento) * 100) : null;

  const kpis: { label: string; valor: string | number }[] = [
    { label: "Pets cadastrados", valor: totalPets },
    { label: "Tutores cadastrados", valor: totalTutores },
    { label: "Assinaturas ativas", valor: assinaturasAtivas },
    { label: "Visitas no mês", valor: visitasNoMes },
    { label: "Novos pets no mês", valor: novosPetsNoMes },
    {
      label: "Taxa de comparecimento no mês",
      valor: taxaComparecimento === null ? "—" : `${taxaComparecimento}%`,
    },
  ];

  return (
    <div>
      <h1 className={texto.tituloPagina}>
        {primeiroNome ? `Olá, ${primeiroNome}` : "Visão geral"}
      </h1>
      <p className={texto.subtitulo}>
        Um resumo rápido do dia e do mês — a Agenda continua sendo o lugar
        pra ver a semana inteira, reagendar ou cancelar.
      </p>

      <section className="mt-8">
        <h2 className={texto.tituloSecao}>Este mês</h2>
        <p className={texto.subtitulo}>
          Contagens acumuladas do petshop — números de dinheiro (cobranças,
          taxa da plataforma) continuam só em Financeiro.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl border border-surface-border bg-surface-card p-4 shadow-card"
            >
              <p className="text-xs text-ink-500">{kpi.label}</p>
              <p className="mt-1 font-mono text-2xl text-ink-900">{kpi.valor}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className={texto.tituloSecao}>Visitas de hoje</h2>
        <p className={texto.subtitulo}>
          Toque num pet pra avançar o status — presente → pronto → entregue —
          e mandar o aviso automático pro tutor no WhatsApp em pronto/entregue.
          Clicou errado? O ícone de desfazer no canto volta um passo.
        </p>
        <div className="mt-4">
          <VisitasDoDiaSection visitas={visitasHoje} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className={texto.tituloSecao}>Atalhos</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NavCard
            href="/agenda"
            icon={CalendarCheck}
            titulo="Agenda"
            descricao="Visitas da semana, confirmações e status."
          />
          <NavCard
            href="/pets"
            icon={PawPrint}
            titulo="Pets"
            descricao="Cadastro pelo pet — tutor vinculado no mesmo fluxo."
          />
          <NavCard
            href="/catalogo"
            icon={Repeat}
            titulo="Catálogo"
            descricao="Serviços, planos e produtos — preços e frequência."
          />
          <NavCard
            href="/configuracoes"
            icon={Settings}
            titulo="Configurações"
            descricao="Expediente, mensagens, cobrança."
          />
        </div>
      </section>
    </div>
  );
}
