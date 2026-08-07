import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Cliente pro servidor (Server Components, Server Actions, Route Handlers).
// Le/escreve a sessao via cookies do Next — e o que faz o RLS enxergar
// auth.uid() corretamente em cada request.
export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Chamado a partir de um Server Component sem permissao de
            // escrita — inofensivo enquanto o middleware cuidar do refresh
            // da sessao (ver lib/supabase/middleware.ts).
          }
        },
      },
    }
  );
}
