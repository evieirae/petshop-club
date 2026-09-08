"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { alerta, botao, formulario, superficie } from "@/lib/ui/styles";
import { definirNovaSenha } from "./actions";

export function NovaSenhaForm({ obrigatoria }: { obrigatoria: boolean }) {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");

    if (senha !== confirmacao) {
      setErro("As duas senhas não são iguais.");
      return;
    }

    startTransition(async () => {
      const resultado = await definirNovaSenha(senha);
      if (resultado.ok) {
        router.push("/minha-conta");
        router.refresh();
      } else {
        setErro(resultado.erro);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className={`${superficie.cardPadded} space-y-4`}>
      <div>
        <label htmlFor="senha_nova" className={formulario.label}>
          Nova senha
        </label>
        <input
          id="senha_nova"
          type="password"
          autoComplete="new-password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className={formulario.input}
          placeholder="••••••••"
        />
        <p className={formulario.dica}>
          Pelo menos 8 caracteres, com letra e número.
        </p>
      </div>

      <div>
        <label htmlFor="senha_confirmacao" className={formulario.label}>
          Repita a nova senha
        </label>
        <input
          id="senha_confirmacao"
          type="password"
          autoComplete="new-password"
          required
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          className={formulario.input}
          placeholder="••••••••"
        />
      </div>

      {erro && (
        <p role="alert" className={alerta("erro")}>
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className={botao({ tamanho: "lg", largura: "cheia" })}
      >
        {pending ? "Salvando…" : obrigatoria ? "Definir minha senha" : "Trocar senha"}
      </button>
    </form>
  );
}
