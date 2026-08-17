"use client";

import { botao } from "@/lib/ui/styles";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleClick() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button onClick={handleClick} className={botao({ variante: "neutra" })}>
      <LogOut size={16} aria-hidden="true" />
      Sair
    </button>
  );
}
