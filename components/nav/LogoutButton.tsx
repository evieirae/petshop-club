"use client";

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
    <button
      onClick={handleClick}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-500 transition hover:bg-surface-card hover:text-ink-900"
    >
      <LogOut size={16} aria-hidden="true" />
      Sair
    </button>
  );
}
