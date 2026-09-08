import Link from "next/link";
import { CalendarPlus, PawPrint, ShoppingBag } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { exigirTutor } from "@/lib/auth/exigirTutor";
import { StatusBadge } from "@/components/agenda/StatusBadge";
import { ReservasTutorSection, type ReservaResumida } from "./ReservasTutorSection";
import { Badge } from "@/components/ui/Badge";
import { botao, superficie, texto } from "@/lib/ui/styles";
import type { Agendamento, Assinatura, Cobranca, Pet } from "@/types/database";

// Primeira tela do portal do tutor. É SÓ LEITURA de propósito: a 0024 não
// criou nenhuma policy de escrita pro tutor, e marcar visita / configurar
// recorrência / reservar produto entram nas migrations seguintes, cada uma
// com sua própria regra (ver claude/plano-home-3-acessos-portal-tutor.md).
//
// Sem essa tela, o login do tutor seria um beco: ele entra, troca a senha e
// não tem pra onde ir.

const MOEDA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function dataHoraLonga(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mesCompetencia(competencia: string): string {
  // competencia é sempre o dia 1 do mês ("2026-08-01"); montar o Date a
  // partir dos componentes evita o deslocamento de fuso que jogaria pro
  // mês anterior à noite.
  const [ano, mes] = competencia.split("-").map(Number);
  return new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

export default async function MinhaContaPage() {
  const { tutor, petshop } = await exigirTutor();
  const supabase = createClient();

  // As policies "acesso_tutor" da 0024 já reduzem cada tabela às linhas
  // deste tutor — por isso nenhuma query abaixo filtra por tutor_id na mão.
  // Filtrar no cliente daria a falsa impressão de que é o filtro que
  // protege; aqui, se a policy sumir, a tela quebra em vez de vazar.
  const [
    { data: petsData },
    { data: assinaturasData },
    { data: agendamentosData },
    { data: cobrancasData },
    { data: reservasData },
  ] = await Promise.all([
    supabase.from("pets").select("*").eq("ativo", true).order("nome"),
    supabase.from("assinaturas").select("*").neq("status", "cancelada"),
    supabase
      .from("agendamentos")
      .select("*")
      .gte("data_hora", new Date().toISOString())
      .not("status", "in", "(cancelado,faltou,entregue)")
      .order("data_hora")
      .limit(6),
    supabase
      .from("cobrancas")
      .select("*")
      .order("competencia", { ascending: false })
      .limit(6),
    // Migration 0026 — reservas da lojinha que ainda estão de pé. A policy
    // "acesso_tutor" de vendas (0024) já restringe às dele.
    supabase
      .from("vendas")
      .select("id, valor_total, reservado_ate")
      .eq("status", "reservada")
      .order("reservado_ate"),
  ]);

  const pets = (petsData ?? []) as Pet[];
  const assinaturas = (assinaturasData ?? []) as Assinatura[];
  const agendamentos = (agendamentosData ?? []) as Agendamento[];
  const cobrancas = (cobrancasData ?? []) as Cobranca[];

  // Os itens de cada reserva vêm numa segunda consulta em vez de join
  // aninhado: são poucas linhas, e o nome do produto precisa passar pela
  // policy "vitrine_tutor" de produtos (0026) de qualquer forma.
  const reservasBase = (reservasData ?? []) as {
    id: string;
    valor_total: number;
    reservado_ate: string | null;
  }[];

  let reservas: ReservaResumida[] = [];
  if (reservasBase.length > 0) {
    const { data: itensData } = await supabase
      .from("venda_itens")
      .select("venda_id, quantidade, produtos(nome)")
      .in(
        "venda_id",
        reservasBase.map((r) => r.id)
      );

    const itensPorVenda = new Map<string, { nome: string; quantidade: number }[]>();
    for (const item of (itensData ?? []) as unknown as {
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

    reservas = reservasBase.map((r) => ({
      ...r,
      itens: itensPorVenda.get(r.id) ?? [],
    }));
  }

  const nomePorPet = new Map(pets.map((pet) => [pet.id, pet.nome]));
  const petDaAssinatura = new Map(assinaturas.map((a) => [a.id, a.pet_id]));

  /**
   * Visita avulsa (0009) aponta pro pet direto; visita de plano aponta pra
   * assinatura, e é ela que sabe o pet. As duas aparecem na mesma lista.
   */
  function nomeDoPet(agendamento: Agendamento): string {
    const petId =
      agendamento.pet_id ??
      (agendamento.assinatura_id
        ? petDaAssinatura.get(agendamento.assinatura_id)
        : undefined);
    return (petId && nomePorPet.get(petId)) || "seu pet";
  }

  const [proxima, ...seguintes] = agendamentos;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={texto.tituloPagina}>Olá, {tutor.nome.split(" ")[0]}</h1>
          <p className={texto.subtitulo}>Sua conta no {petshop.nome}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Único CTA amarelo da tela — é a ação principal do portal. A
              lojinha vem logo ao lado, mas de contorno: reservar shampoo é
              secundário perto de marcar o banho. */}
          <Link href="/minha-conta/agendar" className={botao({ variante: "cta" })}>
            <CalendarPlus size={16} aria-hidden="true" />
            Marcar visita
          </Link>
          <Link href="/minha-conta/loja" className={botao({ variante: "contorno" })}>
            <ShoppingBag size={16} aria-hidden="true" />
            Lojinha
          </Link>
        </div>
      </div>

      {/* ---------- próxima visita ---------- */}
      <section>
        <h2 className={texto.tituloSecao}>Próxima visita</h2>
        {proxima ? (
          <div className={`mt-3 ${superficie.cardPadded}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-xl text-ink-900">
                  <span className="capitalize">{nomeDoPet(proxima)}</span>
                </p>
                <p className="mt-1 text-sm capitalize text-ink-500">
                  {dataHoraLonga(proxima.data_hora)}
                </p>
              </div>
              <StatusBadge status={proxima.status} />
            </div>
            <p className="mt-4 text-xs text-ink-500">
              Precisa remarcar ou cancelar esta visita? Fale com o{" "}
              {petshop.nome}
              {petshop.telefone ? ` — ${petshop.telefone}` : ""}. Mexer numa
              visita já marcada ainda não dá por aqui; marcar uma nova, sim.
            </p>
          </div>
        ) : (
          <div className={`mt-3 ${superficie.vazio}`}>
            <PawPrint size={24} className="mx-auto text-ink-400" aria-hidden="true" />
            <p className="mt-3 text-sm text-ink-500">
              Nenhuma visita marcada por enquanto.
            </p>
            <Link
              href="/minha-conta/agendar"
              className={`mt-4 ${botao({ variante: "contorno" })}`}
            >
              Marcar a primeira
            </Link>
          </div>
        )}
      </section>

      {/* ---------- as próximas ---------- */}
      {seguintes.length > 0 && (
        <section>
          <h2 className={texto.tituloSecao}>Depois dessa</h2>
          <div className="mt-3 divide-y divide-surface-border overflow-hidden rounded-xl border border-surface-border bg-surface-card shadow-card">
            {seguintes.map((ag) => (
              <div key={ag.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="text-sm text-ink-900">
                    <span className="capitalize">{nomeDoPet(ag)}</span>
                  </p>
                  <p className="text-xs capitalize text-ink-500">
                    {dataHoraLonga(ag.data_hora)}
                  </p>
                </div>
                <StatusBadge status={ag.status} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------- reservas da lojinha ---------- */}
      <ReservasTutorSection reservas={reservas} />

      {/* ---------- pets ---------- */}
      <section>
        <h2 className={texto.tituloSecao}>Meus pets</h2>
        {pets.length > 0 ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {pets.map((pet) => (
              <div key={pet.id} className={superficie.cardPadded}>
                <p className="font-medium text-ink-900">{pet.nome}</p>
                <p className="mt-0.5 text-sm text-ink-500">
                  {pet.raca ?? "Raça não informada"}
                </p>
                {pet.observacoes && (
                  <p className="mt-2 text-xs text-ink-500">{pet.observacoes}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className={`mt-3 ${superficie.vazio}`}>
            <p className="text-sm text-ink-500">
              Nenhum pet no seu cadastro ainda. O {petshop.nome} cadastra, ou
              te manda o link pra você mesmo preencher.
            </p>
          </div>
        )}
      </section>

      {/* ---------- gastos ---------- */}
      <section>
        <h2 className={texto.tituloSecao}>Meus gastos</h2>
        {cobrancas.length > 0 ? (
          <div className="mt-3 divide-y divide-surface-border overflow-hidden rounded-xl border border-surface-border bg-surface-card shadow-card">
            {cobrancas.map((cobranca) => (
              <div
                key={cobranca.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div>
                  <p className="text-sm capitalize text-ink-900">
                    {mesCompetencia(cobranca.competencia)}
                  </p>
                  <p className="text-xs text-ink-500">
                    {cobranca.quantidade_banhos}{" "}
                    {cobranca.quantidade_banhos === 1 ? "banho" : "banhos"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-ink-900">
                    {MOEDA.format(cobranca.valor_total)}
                  </span>
                  <Badge tom={cobranca.status === "pago" ? "sucesso" : "atencao"}>
                    {cobranca.status === "pago" ? "Pago" : "Em aberto"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={`mt-3 ${superficie.vazio}`}>
            <p className="text-sm text-ink-500">
              Nenhuma cobrança ainda. Assim que a primeira mensalidade for
              gerada, o histórico aparece aqui.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
