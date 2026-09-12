"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Inbox } from "lucide-react";
import { nomeServico, racaDoPet } from "@/lib/agenda/resolver";
import { botao, texto } from "@/lib/ui/styles";
import type {
  Agendamento,
  CategoriaServico,
  Pet,
  Servico,
  Tutor,
} from "@/types/database";
import { aceitarPedidoAgendamento, recusarPedidoAgendamento } from "./actions";

// Faixa no topo da Agenda com os pedidos que o tutor mandou pelo portal
// (migration 0025) e ninguém respondeu ainda.
//
// Fica FORA de AgendaSection.tsx de propósito: aquele arquivo já tem 1200
// linhas e resolve outro problema (a semana inteira). Isto aqui é uma caixa
// de entrada — some da tela quando está vazia, que é o estado normal.
//
// Não existe lembrete de WhatsApp avisando o petshop de pedido novo ainda
// (precisaria de um tipo novo em `lembretes` e de template aprovado na
// Meta) — esta faixa é o aviso. Ver o bloco "O QUE ESTA MIGRATION NAO FAZ"
// no fim de 0025_agendamento_pelo_tutor.sql.

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PedidosSection({
  pedidos,
  tutores,
  pets,
  servicos,
  categorias,
}: {
  pedidos: Agendamento[];
  tutores: Tutor[];
  pets: Pet[];
  servicos: Servico[];
  categorias: CategoriaServico[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");

  if (pedidos.length === 0) return null;

  function responder(id: string, aceitar: boolean) {
    setErro("");
    startTransition(async () => {
      const resultado = aceitar
        ? await aceitarPedidoAgendamento(id)
        : await recusarPedidoAgendamento(id);
      if (!resultado.ok) setErro(resultado.erro);
      else router.refresh();
    });
  }

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-2">
        <Inbox size={18} className="text-cta-700" aria-hidden="true" />
        <h2 className={texto.tituloSecao}>
          Pedidos aguardando resposta
        </h2>
      </div>
      <p className="mb-3 text-sm text-ink-500">
        Marcados pelo próprio tutor no portal. O horário já está segurado —
        recusar devolve ele pra grade na hora.
      </p>

      {erro && (
        <p role="alert" className="mb-3 text-sm text-danger-600">
          {erro}
        </p>
      )}

      <div className="divide-y divide-surface-border overflow-hidden rounded-xl border border-cta-100 bg-cta-50">
        {pedidos.map((pedido) => {
          const pet = pets.find((p) => p.id === pedido.pet_id);
          const tutor = tutores.find((t) => t.id === pedido.tutor_id);
          const servico = servicos.find((s) => s.id === pedido.servico_id);

          return (
            <div
              key={pedido.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">
                  {pet?.nome ?? "Pet removido"}{" "}
                  <span className="font-normal text-ink-500">
                    · {racaDoPet(pet)}
                  </span>
                </p>
                <p className="text-xs text-ink-500">
                  {tutor?.nome ?? "Tutor removido"} · {nomeServico(servico, categorias)} ·{" "}
                  <span className="font-mono">{quando(pedido.data_hora)}</span>
                  {pedido.preco_avulso !== null &&
                    ` · ${MOEDA.format(pedido.preco_avulso)}`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => responder(pedido.id, true)}
                  className={botao({ tamanho: "sm" })}
                >
                  Aceitar
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => responder(pedido.id, false)}
                  className={botao({ variante: "perigo", tamanho: "sm" })}
                >
                  Recusar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
