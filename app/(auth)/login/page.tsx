"use client";

import { Logo } from "@/components/brand/Logo";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { alerta, botao, formulario, superficie } from "@/lib/ui/styles";

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
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo tamanho="lg" />
        </div>

        {/* O card branco sobre o cinza da página separa o formulário do fundo
            sem precisar de moldura decorativa. */}
        <div className={`${superficie.cardPadded} sm:p-8`}>
          <h1 className="font-display text-xl text-ink-900">Entrar</h1>
          <p className="mt-1 text-sm text-ink-500">
            Painel da equipe — use seu acesso do petshop.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className={formulario.label}>
                E-mail
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={formulario.input}
                placeholder="voce@petshop.com.br"
              />
            </div>

            <div>
              <label htmlFor="senha" className={formulario.label}>
                Senha
              </label>
              <input
                id="senha"
                type="password"
                required
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
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
              disabled={carregando}
              className={botao({ tamanho: "lg", largura: "cheia" })}
            >
              {carregando ? "Entrando…" : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
