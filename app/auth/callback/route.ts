import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { destinoPosLogin } from "@/app/(auth)/login/actions";

// Callback do login social (hoje só Google) — o provedor redireciona pra cá
// com ?code=..., e aqui a troca por sessão acontece de verdade
// (exchangeCodeForSession grava os cookies via createClient(), o mesmo
// client de Server Actions/Server Components — Route Handlers também têm
// acesso a next/headers cookies()).
//
// Depois de trocar o code, a MESMA decisão de destino que o login por senha
// já usa (destinoPosLogin, em app/(auth)/login/actions.ts) — inclusive o
// caso de "sessão válida sem identidade nenhuma" (alguém que nunca foi
// convidado clicou em Entrar com Google): isso já cai em /painel mostrando
// "Acesso pendente", sem vazar nada, porque nenhuma policy de RLS reconhece
// esse auth.uid(). Não precisou escrever nenhuma lógica nova de "vincular
// por e-mail" — o Supabase Auth já faz isso sozinho quando o e-mail do
// Google bate com um auth.users existente (email já confirmado, que é o
// caso de todo mundo criado via app/(admin)/admin/actions.ts).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?erro=oauth`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("Erro ao trocar code por sessão (login social):", error);
    return NextResponse.redirect(`${origin}/login?erro=oauth`);
  }

  const resultado = await destinoPosLogin();
  if ("erro" in resultado) {
    return NextResponse.redirect(`${origin}/login?erro=${encodeURIComponent(resultado.erro)}`);
  }

  return NextResponse.redirect(`${origin}${resultado.destino}`);
}
