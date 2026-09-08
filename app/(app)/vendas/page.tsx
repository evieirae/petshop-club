import { redirect } from "next/navigation";
import { getUsuarioContext } from "@/lib/auth/getContext";
import { createClient } from "@/lib/supabase/server";
import type { Funcionario, Produto, Tutor } from "@/types/database";
import { VendasSection } from "./VendasSection";
import { ReservasSection, type ReservaPendente } from "./ReservasSection";

// Vendas (20/ago/2026) — tela própria, separada do Catálogo. Era uma aba
// dentro de Produtos até aqui; virou tela porque é a tarefa mais repetida do
// balcão, e porque cadastrar produto e vender produto são trabalhos
// diferentes, feitos por pessoas diferentes em momentos diferentes.
export default async function VendasPage() {
  const contexto = await getUsuarioContext();

  if (!contexto?.petshop?.id) {
    redirect("/login");
  }

  const supabase = createClient();
  const petshopId = contexto.petshop.id;

  const [
    { data: produtos },
    { data: tutores },
    { data: funcionarios },
    { data: reservasBase },
  ] = await Promise.all([
    supabase.from("produtos").select("*").eq("petshop_id", petshopId).order("nome"),
    supabase.from("tutores").select("*").eq("petshop_id", petshopId).order("nome"),
    // Migration 0016 — só funcionário ativo aparece como vendedor. Quem saiu
    // do petshop continua na tabela (pra não quebrar o histórico de vendas
    // dele), mas não pode receber venda nova.
    supabase
      .from("funcionarios")
      .select("*")
      .eq("petshop_id", petshopId)
      .eq("ativo", true)
      .order("nome"),
    // Migration 0026 — reservas feitas pelo tutor no portal, esperando
    // alguém retirar. Ordenadas pelo prazo: o que vence primeiro aparece
    // primeiro, que é a ordem em que o balcão precisa resolver.
    supabase
      .from("vendas")
      .select("id, tutor_id, valor_total, reservado_ate, criado_em")
      .eq("petshop_id", petshopId)
      .eq("status", "reservada")
      .order("reservado_ate"),
  ]);

  // Os itens vêm numa segunda consulta em vez de join aninhado — são poucas
  // linhas por vez, e assim a query principal continua legível.
  type ReservaBase = {
    id: string;
    tutor_id: string | null;
    valor_total: number;
    reservado_ate: string | null;
    criado_em: string;
  };

  const reservasCru = (reservasBase as ReservaBase[]) ?? [];
  let reservas: ReservaPendente[] = [];

  if (reservasCru.length > 0) {
    const { data: itens } = await supabase
      .from("venda_itens")
      .select("venda_id, quantidade, produtos(nome)")
      .in(
        "venda_id",
        reservasCru.map((r) => r.id)
      );

    const itensPorVenda = new Map<string, { nome: string; quantidade: number }[]>();
    for (const item of (itens ?? []) as unknown as {
      venda_id: string;
      quantidade: number;
      produtos: { nome: string } | null;
    }[]) {
      const lista = itensPorVenda.get(item.venda_id) ?? [];
      lista.push({
        nome: item.produtos?.nome ?? "Produto removido",
        quantidade: item.quantidade,
      });
      itensPorVenda.set(item.venda_id, lista);
    }

    const porTutor = new Map(
      ((tutores as Tutor[]) ?? []).map((t) => [t.id, t])
    );

    reservas = reservasCru.map((r) => {
      const tutor = r.tutor_id ? porTutor.get(r.tutor_id) : undefined;
      return {
        id: r.id,
        valor_total: r.valor_total,
        reservado_ate: r.reservado_ate,
        criado_em: r.criado_em,
        tutorNome: tutor?.nome ?? "Tutor removido",
        tutorTelefone: tutor?.telefone ?? null,
        itens: itensPorVenda.get(r.id) ?? [],
      };
    });
  }

  return (
    <div>
      <h1 className="font-display text-2xl text-ink-900">Vendas</h1>
      <p className="mt-1 text-sm text-ink-500">
        Venda de balcão — ração, caminha, shampoo, coleira. O cadastro de
        produtos e preços fica no Catálogo.
      </p>

      <div className="mt-8">
        <ReservasSection reservas={reservas} />

        <VendasSection
          petshopId={petshopId}
          produtos={(produtos as Produto[]) ?? []}
          tutores={(tutores as Tutor[]) ?? []}
          funcionarios={(funcionarios as Funcionario[]) ?? []}
          comissaoAtiva={contexto.petshop.comissao_ativa}
        />
      </div>
    </div>
  );
}
