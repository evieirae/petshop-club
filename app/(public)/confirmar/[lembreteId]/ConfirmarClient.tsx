"use client";

import { botao } from "@/lib/ui/styles";
import { useState, useTransition } from "react";
import { confirmarPresenca } from "./actions";

export function ConfirmarClient({
  lembreteId,
  jaConfirmado,
}: {
  lembreteId: string;
  jaConfirmado: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmado, setConfirmado] = useState(jaConfirmado);
  const [erro, setErro] = useState("");

  function handleClick() {
    setErro("");
    startTransition(async () => {
      const resultado = await confirmarPresenca(lembreteId);
      if (resultado.ok) {
        setConfirmado(true);
      } else {
        setErro(resultado.erro);
      }
    });
  }

  if (confirmado) {
    return (
      <p className="rounded-lg border border-success-100 bg-success-50 px-4 py-3 text-center text-sm text-success-700">
        Presença confirmada! Te esperamos no horário combinado.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={botao({ tamanho: "lg", largura: "cheia" })}
      >
        {pending ? "Confirmando…" : "Confirmar presença"}
      </button>
      {erro && <p className="text-center text-sm text-danger-600">{erro}</p>}
    </div>
  );
}
