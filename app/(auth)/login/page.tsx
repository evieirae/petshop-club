"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    setCarregando(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    setCarregando(false);

    if (error) {
      setErro("E-mail ou senha incorretos. Confira e tente de novo.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Selo — mesmo motivo visual do cartao de assinatura: um carimbo. */}
        <div className="mb-8 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-stamp border-2 border-dashed border-club text-club">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <path d="M12 21c-4-3.2-8-6.6-8-11a5 5 0 0 1 8-4 5 5 0 0 1 8 4c0 4.4-4 7.8-8 11Z" />
            </svg>
          </div>
        </div>

        <h1 className="text-center font-display text-2xl text-ink-900">
          Clube de Banho e Tosa
        </h1>
        <p className="mt-1 text-center text-sm text-ink-500">
          Painel da equipe — entre com seu acesso do petshop.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-ink-700"
            >
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-ink-900 placeholder:text-ink-500/60"
              placeholder="voce@petshop.com.br"
            />
          </div>

          <div>
            <label
              htmlFor="senha"
              className="mb-1 block text-sm font-medium text-ink-700"
            >
              Senha
            </label>
            <input
              id="senha"
              type="password"
              required
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-ink-900"
              placeholder="••••••••"
            />
          </div>

          {erro && (
            <p
              role="alert"
              className="rounded-lg bg-pendente-bg px-3 py-2 text-sm text-pendente"
            >
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={carregando}
            className="w-full rounded-lg bg-club px-4 py-2.5 font-medium text-white transition hover:bg-club-dark disabled:opacity-60"
          >
            {carregando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
