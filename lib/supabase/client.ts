import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

// Cliente pro navegador (Client Components). Usa a anon key — a seguranca
// real vem das policies de RLS do schema (isolamento_petshop), nao daqui.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
