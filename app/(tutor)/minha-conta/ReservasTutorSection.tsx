"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { botao, texto } from "@/lib/ui/styles";
import { cancelarMinhaReserva } from "./loja/actions";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export type ReservaResumida = {
  id: string;
  valor_total: number;
  reservado_ate: string | null;
  itens: { nome: string; quantidade: number }[];
};

function prazo(iso: string | null): { texto: string; urgente: boolean } {
  if (!iso) return { texto: "sem prazo", urgente: false };
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
    // Menos de 12h é o momento em que avisar ainda muda alguma coisa.
    urgente: horas < 12,
  };
}

export function ReservasTutorSection({ reservas }: { reservas: ReservaResumida[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");

  if (reservas.length === 0) return null;

  function cancelar(id: string) {
    setErro("");
    startTransition(async () => {
      const resultado = await cancelarMinhaReserva(id);
      if (!resultado.ok) setErro(resultado.erro);
      else router.refresh();
    });
  }

  return (
    <section>
      <h2 className={texto.tituloSecao}>Reservado pra você</h2>
      <p className={texto.subtitulo}>
        Separado no balcão. Você paga na hora de retirar.
      </p>

      {erro && (
        <p role="alert" className="mt-2 text-sm text-danger-600">
          {erro}
        </p>
      )}

      <div className="mt-3 divide-y divide-surface-border overflow-hidden rounded-xl border border-surface-border bg-surface-card shadow-card">
        {reservas.map((reserva) => {
          const { texto: quando, urgente } = prazo(reserva.reservado_ate);
          return (
            <div
              key={reserva.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="text-sm text-ink-900">
                  {reserva.itens
                    .map((item) => `${item.quantidade}× ${item.nome}`)
                    .join(", ")}
                </p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-500">
                  <span className="font-mono text-ink-900">
                    {MOEDA.format(reserva.valor_total)}
                  </span>
                  <Badge tom={urgente ? "atencao" : "info"}>guardado até {quando}</Badge>
                </p>
              </div>

              <button
                type="button"
                disabled={pending}
                onClick={() => cancelar(reserva.id)}
                className={botao({ variante: "textoPerigo", tamanho: "sm" })}
              >
                Desistir
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
