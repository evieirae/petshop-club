"use client";

import { Logo } from "@/components/brand/Logo";
import Link from "next/link";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { alerta, botao, formulario, superficie } from "@/lib/ui/styles";
import { destinoPosLogin } from "./actions";

// useSearchParams() exige um limite de Suspense em volta (Next 14 App
// Router) — é como o /login lê o ?erro= que app/auth/callback/route.ts
// devolve quando o login social falha ou cai em "Acesso pendente".
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [carregandoGoogle, setCarregandoGoogle] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Erro que voltou do callback do Google (app/auth/callback/route.ts),
  // repassado via query string porque aquele redirect não roda no browser
  // — não tem como setState direto de lá.
  useEffect(() => {
    const erroUrl = searchParams.get("erro");
    if (!erroUrl) return;
    setErro(
      erroUrl === "oauth"
        ? "Não deu pra entrar com Google. Tenta de novo ou use e-mail e senha."
        : erroUrl
    );
  }, [searchParams]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    setCarregando(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) {
      setCarregando(false);
      setErro("E-mail ou senha incorretos. Confira e tente de novo.");
      return;
    }

    // Uma porta, tres destinos (0024): equipe de petshop, administracao da
    // plataforma e tutor. Quem decide e o servidor — o browser nao tem como
    // saber qual das tres identidades esse login e sem consultar tabelas que
    // a RLS protege.
    const resultado = await destinoPosLogin();
    setCarregando(false);

    if ("erro" in resultado) {
      setErro(resultado.erro);
      return;
    }

    router.push(resultado.destino);
    router.refresh();
  }

  async function handleGoogle() {
    setErro(null);
    setCarregandoGoogle(true);

    // O restante do fluxo acontece fora daqui: o browser é redirecionado
    // pro Google, e a volta cai em app/auth/callback/route.ts, que troca o
    // code por sessão e decide o destino (mesma destinoPosLogin() de cima).
    // Só funciona pra e-mail com conta Google (Gmail ou Workspace) — quem
    // não tem continua entrando por e-mail e senha, como sempre.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setCarregandoGoogle(false);
      setErro("Não deu pra iniciar o login com Google. Tenta de novo.");
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-4 inline-block text-sm font-medium text-ink-500 hover:text-ink-700">
          ← Voltar
        </Link>
        <div className="mb-8 flex justify-center">
          <Logo tamanho="lg" />
        </div>

        {/* O card branco sobre o cinza da página separa o formulário do fundo
            sem precisar de moldura decorativa. */}
        <div className={`${superficie.cardPadded} sm:p-8`}>
          <h1 className="font-display text-xl text-ink-900">Entrar</h1>
          <p className="mt-1 text-sm text-ink-500">
            Uma porta só: equipe do petshop, administração e tutor entram por
            aqui.
          </p>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={carregandoGoogle || carregando}
            className={botao({ variante: "contorno", tamanho: "lg", largura: "cheia" })}
          >
            <span className="flex items-center justify-center gap-2">
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
                <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05z" />
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
              </svg>
              {carregandoGoogle ? "Redirecionando…" : "Entrar com Google"}
            </span>
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-surface-border" />
            <span className="text-xs text-ink-500">ou</span>
            <div className="h-px flex-1 bg-surface-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
