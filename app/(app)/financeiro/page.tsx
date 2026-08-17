import { Badge } from "@/components/ui/Badge";
import type { TomBadge } from "@/lib/ui/styles";
import { redirect } from "next/navigation";
import { getUsuarioContext } from "@/lib/auth/getContext";
import { createClient } from "@/lib/supabase/server";
import type { Cobranca, CobrancaAvulsa, MensalidadePetshop, StatusCobranca } from "@/types/database";

// Fase 6 (docs/fase6_pagamentos.md, seção 12) — visão do petshop sobre o
// próprio dinheiro: cobranças do mês (assinatura + avulsa) com bruto,
// corte da plataforma e líquido, mais a mensalidade da plataforma. RLS
// (isolamento_petshop, já existente em cobrancas/cobrancas_avulsas/
// mensalidades_petshop desde 0001/0003) garante que só aparece o que é
// desse petshop — mesmo racional de app/(app)/tutores/page.tsx, sem
// filtro explícito de petshop_id na query.
//
// AVISO: esta tela lê colunas que só existem depois da migration 0006
// (rascunho, não aplicada/testada — ver docs/fase6_pagamentos.md). Não vai
// funcionar contra o banco atual até essa migration rodar de verdade.

const LABEL_STATUS: Record<StatusCobranca, string> = {
  pendente: "Pendente",
  processando: "Processando",
  aguardando_pagamento: "Aguardando Pix",
  pago: "Pago",
  falhou: "Falhou",
  estornado: "Estornado",
  isento: "Isento",
};

const TOM_STATUS: Record<StatusCobranca, TomBadge> = {
  pendente: "neutro",
  processando: "info",
  // Amarelo: a cobrança está parada esperando o tutor — é o status que o dono
  // do petshop precisa enxergar de longe na tabela.
  aguardando_pagamento: "atencao",
  pago: "sucesso",
  falhou: "erro",
  estornado: "erro",
  isento: "neutro",
};

function formatarPreco(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function StatusBadge({ status }: { status: StatusCobranca }) {
  return (
    <Badge tom={TOM_STATUS[status]} ponto={status === "falhou" || status === "aguardando_pagamento"}>
      {LABEL_STATUS[status]}
    </Badge>
  );
}

type LinhaCobranca = {
  id: string;
  tipo: "Assinatura" | "Avulsa";
  tutorNome: string;
  data: string;
  valorTotal: number;
  valorPercentual: number;
  valorPetshop: number;
  status: StatusCobranca;
};

export default async function FinanceiroPage() {
  const contexto = await getUsuarioContext();

  if (!contexto?.petshop?.id) {
    redirect("/login");
  }

  const supabase = createClient();

  const inicioMes = new Date();
  inicioMes.setDate(1);
  const competenciaAtual = inicioMes.toISOString().slice(0, 10);

  const inicioProximoMes = new Date(inicioMes);
  inicioProximoMes.setMonth(inicioProximoMes.getMonth() + 1);
  const proximaCompetencia = inicioProximoMes.toISOString().slice(0, 10);

  const [{ data: cobrancas }, { data: avulsas }, { data: mensalidades }] = await Promise.all([
    supabase
      .from("cobrancas")
      .select("*, assinaturas(tutor_id, tutores(nome))")
      .gte("competencia", competenciaAtual)
      .lt("competencia", proximaCompetencia)
      .order("criado_em", { ascending: false }),
    supabase
      .from("cobrancas_avulsas")
      .select("*, tutores(nome)")
      .gte("criado_em", inicioMes.toISOString())
      .lt("criado_em", inicioProximoMes.toISOString())
      .order("criado_em", { ascending: false }),
    supabase
      .from("mensalidades_petshop")
      .select("*")
      .gte("competencia", competenciaAtual)
      .lt("competencia", proximaCompetencia)
      .maybeSingle(),
  ]);

  const linhas: LinhaCobranca[] = [
    ...((cobrancas ?? []) as unknown as (Cobranca & { assinaturas: { tutores: { nome: string } | null } | null })[]).map(
      (c) => ({
        id: c.id,
        tipo: "Assinatura" as const,
        tutorNome: c.assinaturas?.tutores?.nome ?? "—",
        data: c.competencia,
        valorTotal: c.valor_total,
        valorPercentual: c.valor_percentual,
        valorPetshop: c.valor_petshop,
        status: c.status,
      })
    ),
    ...((avulsas ?? []) as unknown as (CobrancaAvulsa & { tutores: { nome: string } | null })[]).map((c) => ({
      id: c.id,
      tipo: "Avulsa" as const,
      tutorNome: c.tutores?.nome ?? "—",
      data: c.criado_em.slice(0, 10),
      valorTotal: c.valor_total,
      valorPercentual: c.valor_percentual,
      valorPetshop: c.valor_petshop,
      status: c.status,
    })),
  ].sort((a, b) => (a.data < b.data ? 1 : -1));

  // Fase 6, decisão de 16/ago/2026 (docs/fase6_pagamentos.md, seção 1c):
  // valor_petshop é SEMPRE igual a valor_total agora (o petshop recebe o
  // valor cheio do serviço) — não é mais "bruto menos corte". A receita da
  // plataforma (valor_percentual) e a taxa do gateway são cobradas À PARTE
  // do tutor, não descontadas daqui — por isso os cards abaixo mostram
  // "valor dos serviços" (= o que o petshop recebe) separado da "taxa de
  // serviço cobrada do tutor" (receita da plataforma), em vez de um
  // bruto/corte/líquido que dava a entender que um saía do outro.
  const totalServicos = linhas.reduce((soma, l) => soma + l.valorTotal, 0);
  const totalTaxaPlataforma = linhas.reduce((soma, l) => soma + l.valorPercentual, 0);
  const inadimplentes = linhas.filter((l) => l.status === "falhou");

  const mensalidade = mensalidades as MensalidadePetshop | null;

  return (
    <div>
      <h1 className="font-display text-2xl text-ink-900">Financeiro</h1>
      <p className="mt-1 text-sm text-ink-500">
        Cobranças do mês — ver docs/fase6_pagamentos.md, seção 12. O
        petshop recebe sempre o valor cheio do serviço; a taxa de serviço é
        cobrada à parte, do tutor (seção 1c).
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-surface-border bg-surface-card p-5 shadow-card">
          <p className="text-xs text-ink-500">Valor dos serviços do mês</p>
          <p className="mt-1 font-mono text-xl text-success-700">{formatarPreco(totalServicos)}</p>
          <p className="mt-1 text-xs text-ink-500">É isso que cai na sua conta — valor cheio, sem desconto.</p>
        </div>
        <div className="rounded-xl border border-surface-border bg-surface-card p-5 shadow-card">
          <p className="text-xs text-ink-500">Taxa de serviço cobrada dos tutores</p>
          <p className="mt-1 font-mono text-xl text-ink-900">{formatarPreco(totalTaxaPlataforma)}</p>
          <p className="mt-1 text-xs text-ink-500">Receita da plataforma — não sai do seu valor.</p>
        </div>
      </div>

      {mensalidade && (
        <div className="mt-4 rounded-xl border border-surface-border bg-surface-card p-5 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink-900">Mensalidade da plataforma</p>
              <p className="text-xs text-ink-500">
                Competência de {new Date(competenciaAtual).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-ink-900">{formatarPreco(mensalidade.valor)}</span>
              <StatusBadge status={mensalidade.status} />
            </div>
          </div>
        </div>
      )}

      {inadimplentes.length > 0 && (
        <div className="mt-4 rounded-xl border border-danger-100 bg-danger-50 px-5 py-4">
          <p className="text-sm font-medium text-danger-600">
            {inadimplentes.length} cobrança(s) com falha definitiva este mês — precisa de atenção manual
            (reenviar cobrança, atualizar cartão do tutor, ou ajustar a visita).
          </p>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-surface-border bg-surface-card">
        <table className="w-full text-sm">
          <thead className="border-b border-surface-border bg-surface-muted text-left text-xs text-ink-500">
            <tr>
              <th className="px-4 py-3 font-medium">Tutor</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Data</th>
              <th className="px-4 py-3 font-medium">Valor do serviço</th>
              <th className="px-4 py-3 font-medium">Taxa de serviço</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-ink-500">
                  Nenhuma cobrança neste mês ainda.
                </td>
              </tr>
            )}
            {linhas.map((linha) => (
              <tr key={linha.id} className="border-b border-surface-border last:border-0">
                <td className="px-4 py-3 text-ink-900">{linha.tutorNome}</td>
                <td className="px-4 py-3 text-ink-500">{linha.tipo}</td>
                <td className="px-4 py-3 font-mono text-ink-500">
                  {new Date(linha.data).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-4 py-3 font-mono text-success-700">{formatarPreco(linha.valorTotal)}</td>
                <td className="px-4 py-3 font-mono text-ink-500">{formatarPreco(linha.valorPercentual)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={linha.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
