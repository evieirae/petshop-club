import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/auth/getAdminContext";
import { createAdminClient } from "@/lib/supabase/admin";
import { texto, tabela } from "@/lib/ui/styles";
import type { TomBadge } from "@/lib/ui/styles";
import { Badge } from "@/components/ui/Badge";
import { paraDataLocal, dataLocalDeString } from "@/lib/semana";
import type { Petshop } from "@/types/database";

// KPIs agregados de TODOS os petshops — pedido do Eduardo em
// supabase/migrations/0017_admin_plataforma_independente.sql. Usa
// createAdminClient() (service role) porque essas leituras cruzam petshops
// diferentes, e a RLS de tutores/pets/agendamentos/cobrancas continua
// isolada por auth_petshop_id() (não ganhou bypass de admin — só
// `petshops` e `leads_saas` têm isso). O re-check de admin logo abaixo é a
// única barreira aqui, não uma camada extra — ver regra 4 do comentário em
// lib/supabase/admin.ts.
const STATUS_LABEL: Record<Petshop["status"], string> = {
  ativo: "Ativo",
  congelado: "Congelado",
  encerrado: "Encerrado",
};

const STATUS_TOM: Record<Petshop["status"], TomBadge> = {
  ativo: "sucesso",
  congelado: "atencao",
  encerrado: "erro",
};

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function AdminDashboardPage() {
  const admin = await getAdminContext();
  if (!admin) {
    redirect("/login");
  }

  const supabase = createAdminClient();

  const hojeISO = paraDataLocal(new Date());
  const [ano, mes] = hojeISO.split("-").map(Number);
  const inicioMesISO = paraDataLocal(new Date(ano, mes - 1, 1));
  const inicioProximoMesISO = paraDataLocal(new Date(ano, mes, 1));
  const inicioMes = dataLocalDeString(inicioMesISO).toISOString();
  const inicioProximoMes = dataLocalDeString(inicioProximoMesISO).toISOString();

  const [
    { data: petshops },
    { count: totalTutores },
    { count: totalPets },
    { count: visitasNoMes },
    { data: mensalidadesPagas },
    { data: cobrancasPagas },
    { data: cobrancasAvulsasPagas },
  ] = await Promise.all([
    supabase.from("petshops").select("*").order("nome"),
    supabase.from("tutores").select("id", { count: "exact", head: true }).eq("ativo", true),
    supabase.from("pets").select("id", { count: "exact", head: true }).eq("ativo", true),
    supabase
      .from("agendamentos")
      .select("id", { count: "exact", head: true })
      .gte("data_hora", inicioMes)
      .lt("data_hora", inicioProximoMes),
    supabase
      .from("mensalidades_petshop")
      .select("valor")
      .eq("status", "pago")
      .gte("pago_em", inicioMes)
      .lt("pago_em", inicioProximoMes),
    supabase
      .from("cobrancas")
      .select("valor_percentual")
      .eq("status", "pago")
      .gte("pago_em", inicioMes)
      .lt("pago_em", inicioProximoMes),
    supabase
      .from("cobrancas_avulsas")
      .select("valor_percentual")
      .eq("status", "pago")
      .gte("pago_em", inicioMes)
      .lt("pago_em", inicioProximoMes),
  ]);

  const listaPetshops = (petshops as Petshop[]) ?? [];
  const porStatus = { ativo: 0, congelado: 0, encerrado: 0 };
  listaPetshops.forEach((p) => {
    porStatus[p.status]++;
  });

  const receitaMensalidades = (mensalidadesPagas ?? []).reduce((soma, m) => soma + Number(m.valor), 0);
  const receitaPercentual =
    (cobrancasPagas ?? []).reduce((soma, c) => soma + Number(c.valor_percentual), 0) +
    (cobrancasAvulsasPagas ?? []).reduce((soma, c) => soma + Number(c.valor_percentual), 0);
  const receitaTotal = receitaMensalidades + receitaPercentual;

  const kpis: { label: string; valor: string | number }[] = [
    { label: "Petshops ativos", valor: porStatus.ativo },
    { label: "Petshops congelados", valor: porStatus.congelado },
    { label: "Petshops encerrados", valor: porStatus.encerrado },
    { label: "Tutores ativos", valor: totalTutores ?? 0 },
    { label: "Pets ativos", valor: totalPets ?? 0 },
    { label: "Visitas no mês", valor: visitasNoMes ?? 0 },
  ];

  return (
    <div>
      <h1 className={texto.tituloPagina}>Visão geral da plataforma</h1>
      <p className={texto.subtitulo}>
        Números agregados de todos os petshops — cada petshop continua só
        vendo o próprio recorte em Financeiro.
      </p>

      <section className="mt-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-xl border border-surface-border bg-surface-card p-4 shadow-card">
              <p className="text-xs text-ink-500">{kpi.label}</p>
              <p className="mt-1 font-mono text-2xl text-ink-900">{kpi.valor}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className={texto.tituloSecao}>Receita da plataforma neste mês</h2>
        <p className={texto.subtitulo}>
          Mensalidade fixa + percentual sobre cobranças (assinatura e
          avulsa) — só o que já foi efetivamente pago.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-surface-border bg-surface-card p-4 shadow-card">
            <p className="text-xs text-ink-500">Mensalidades fixas</p>
            <p className="mt-1 font-mono text-xl text-ink-900">{formatarMoeda(receitaMensalidades)}</p>
          </div>
          <div className="rounded-xl border border-surface-border bg-surface-card p-4 shadow-card">
            <p className="text-xs text-ink-500">Percentual sobre cobranças</p>
            <p className="mt-1 font-mono text-xl text-ink-900">{formatarMoeda(receitaPercentual)}</p>
          </div>
          <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 shadow-card">
            <p className="text-xs text-brand-700">Total no mês</p>
            <p className="mt-1 font-mono text-xl text-ink-900">{formatarMoeda(receitaTotal)}</p>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className={texto.tituloSecao}>Petshops</h2>
        <div className={`mt-4 ${tabela.wrapper}`}>
          <table className={tabela.raiz}>
            <thead className={tabela.cabecalho}>
              <tr>
                <th className={tabela.th}>Petshop</th>
                <th className={tabela.th}>Status</th>
                <th className={tabela.th}>Mensalidade</th>
                <th className={tabela.th}>Percentual</th>
              </tr>
            </thead>
            <tbody>
              {listaPetshops.map((p) => (
                <tr key={p.id} className={tabela.linha}>
                  <td className={tabela.td}>{p.nome}</td>
                  <td className={tabela.td}>
                    <Badge tom={STATUS_TOM[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                  </td>
                  <td className={tabela.tdNumero}>{formatarMoeda(p.fee_fixo_mensal)}</td>
                  <td className={tabela.tdNumero}>{(p.percentual_plataforma * 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
