"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { botao } from "@/lib/ui/styles";
import { cancelarReserva, concluirReserva } from "./actions";

// "Tal pessoa reservou tal produto" — o pedido do Eduardo, na tela onde o
// balcão já trabalha. Fica no topo de Vendas e some quando não há reserva
// nenhuma, que é o estado normal.
//
// Não existe aviso de WhatsApp de reserva nova ainda (precisaria de um tipo
// novo em `lembretes` e de template aprovado na Meta) — esta lista é o aviso.

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export type ReservaPendente = {
  id: string;
  valor_total: number;
  reservado_ate: string | null;
  criado_em: string;
  tutorNome: string;
  tutorTelefone: string | null;
  itens: { nome: string; quantidade: number }[];
};

function prazo(iso: string | null) {
  if (!iso) return { texto: "sem prazo", vencendo: false, vencida: false };
  const data = new Date(iso);
  const horas = (data.getTime() - Date.now()) / 3_600_000;
  return {
    texto: data.toLocaleString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
    vencendo: horas > 0 && horas < 12,
    vencida: horas <= 0,
  };
}

export function ReservasSection({ reservas }: { reservas: ReservaPendente[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");

  if (reservas.length === 0) return null;

  function agir(id: string, concluir: boolean) {
    setErro("");
    startTransition(async () => {
      const resultado = concluir ? await concluirReserva(id) : await cancelarReserva(id);
      if (!resultado.ok) setErro(resultado.erro);
      else router.refresh();
    });
  }

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-2">
        <PackageCheck size={18} className="text-cta-700" aria-hidden="true" />
        <h2 className="font-display text-lg text-ink-900">
          Reservas aguardando retirada
        </h2>
      </div>
      <p className="mb-3 text-sm text-ink-500">
        Reservado pelo tutor no portal. O estoque já está segurado — cancelar
        devolve as unidades pra venda na hora.
      </p>

      {erro && (
        <p role="alert" className="mb-3 text-sm text-danger-600">
          {erro}
        </p>
      )}

      <div className="divide-y divide-surface-border overflow-hidden rounded-xl border border-cta-100 bg-cta-50">
        {reservas.map((reserva) => {
          const { texto, vencendo, vencida } = prazo(reserva.reservado_ate);
          return (
            <div
              key={reserva.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">
                  {reserva.tutorNome}
                  {reserva.tutorTelefone && (
                    <span className="ml-2 font-mono text-xs font-normal text-ink-500">
                      {reserva.tutorTelefone}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-ink-500">
                  {reserva.itens
                    .map((item) => `${item.quantidade}× ${item.nome}`)
                    .join(", ")}{" "}
                  ·{" "}
                  <span className="font-mono text-ink-900">
                    {MOEDA.format(reserva.valor_total)}
                  </span>
                </p>
                <p className="mt-1">
                  <Badge tom={vencida ? "erro" : vencendo ? "atencao" : "info"}>
                    {vencida ? `venceu ${texto}` : `guardar até ${texto}`}
                  </Badge>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => agir(reserva.id, true)}
                  className={botao({ tamanho: "sm" })}
                >
                  Registrar retirada
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => agir(reserva.id, false)}
                  className={botao({ variante: "perigo", tamanho: "sm" })}
                >
                  Cancelar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
