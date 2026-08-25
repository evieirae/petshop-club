"use client";

import { useState, useTransition } from "react";
import { botao } from "@/lib/ui/styles";
import { marcarPagamentoLocal } from "./actions";

const LABEL_FORMA: Record<string, string> = {
  cartao: "Cartão",
  pix: "Pix",
  local: "No local",
};

/**
 * Uma cobrança 'pago' já resolvida não precisa mais de ação — só mostra a
 * forma de pagamento (quando conhecida) como texto. Cobrança ainda pendente
 * ganha o botão "Marcar pago no local" (migration 0011): é o balcão
 * confirmando, na hora, que recebeu o dinheiro fora do Asaas.
 */
export function PagamentoLocalBotao({
  origem,
  id,
  status,
  formaPagamento,
}: {
  origem: "cobranca" | "cobranca_avulsa";
  id: string;
  status: string;
  formaPagamento: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState(false);

  const resolvido = status === "pago" || status === "estornado" || feito;

  if (resolvido) {
    return (
      <span className="text-xs text-ink-500">
        {formaPagamento ? LABEL_FORMA[formaPagamento] ?? formaPagamento : "—"}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-xs text-ink-500">
        {formaPagamento ? LABEL_FORMA[formaPagamento] ?? formaPagamento : "—"}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setErro("");
          startTransition(async () => {
            const resultado = await marcarPagamentoLocal(origem, id);
            if (resultado.ok) {
              setFeito(true);
            } else {
              setErro(resultado.erro);
            }
          });
        }}
        className={botao({ variante: "texto", tamanho: "sm", className: "whitespace-nowrap" })}
      >
        {pending ? "Marcando…" : "Marcar pago no local"}
      </button>
      {erro && <p className="text-xs text-danger-600">{erro}</p>}
    </div>
  );
}
