"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Store, UserPlus } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { cx } from "@/lib/ui/styles";

// Casca de navegação da área /admin (app/(admin)/layout.tsx) — separada do
// Sidebar de app/(app) de propósito: são áreas diferentes (esta não
// pertence a nenhum petshop específico), com itens diferentes. Ver
// supabase/migrations/0017_admin_plataforma_independente.sql.
const ITENS = [
  { href: "/admin", label: "Visão geral", icon: LayoutGrid },
  { href: "/admin/petshops", label: "Petshops", icon: Store },
  { href: "/admin/leads", label: "Leads", icon: UserPlus },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-surface-border bg-surface-card px-3 py-6">
      <Link href="/admin" className="mb-1 rounded-lg px-2 py-1" aria-label="PetClub — administração">
        <Logo tamanho="sm" />
      </Link>
      <p className="mb-7 px-2 text-xs font-medium uppercase tracking-wide text-ink-500">
        Administração
      </p>

      <nav className="flex flex-1 flex-col gap-1">
        {ITENS.map(({ href, label, icon: Icon }) => {
          const ativo = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={ativo ? "page" : undefined}
              className={cx(
                "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                ativo
                  ? "bg-brand-50 font-medium text-brand-700 before:absolute before:left-0 before:top-1.5 before:h-[calc(100%-0.75rem)] before:w-0.5 before:rounded-pill before:bg-brand-500"
                  : "text-ink-500 hover:bg-surface-muted-muted hover:text-ink-900",
              )}
            >
              <Icon size={17} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
