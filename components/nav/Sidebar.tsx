"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  CalendarCheck,
  Users,
  Repeat,
  Settings,
  ShieldCheck,
} from "lucide-react";

const ITENS = [
  { href: "/", label: "Visão geral", icon: LayoutGrid },
  { href: "/agenda", label: "Agenda", icon: CalendarCheck },
  { href: "/tutores", label: "Tutores & Pets", icon: Users },
  { href: "/planos", label: "Planos & Serviços", icon: Repeat },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

// So aparece pra quem tem usuarios_petshop.eh_admin_plataforma=true (ver
// supabase/migrations/0002_admin_plataforma.sql) — item separado, no fim,
// pra deixar claro que e uma area diferente do resto do menu (enxerga
// TODOS os petshops, nao so o logado).
const ITEM_ADMIN = { href: "/admin", label: "Administração", icon: ShieldCheck };

export function Sidebar({ ehAdminPlataforma }: { ehAdminPlataforma: boolean }) {
  const pathname = usePathname();
  const itens = ehAdminPlataforma ? [...ITENS, ITEM_ADMIN] : ITENS;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-surface-border bg-surface-card px-3 py-6">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-stamp border-2 border-dashed border-club text-club">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M12 21c-4-3.2-8-6.6-8-11a5 5 0 0 1 8-4 5 5 0 0 1 8 4c0 4.4-4 7.8-8 11Z" />
          </svg>
        </div>
        <span className="font-display text-sm leading-tight text-ink-900">
          Clube de
          <br />
          Banho e Tosa
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {itens.map(({ href, label, icon: Icon }) => {
          const ativo = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                ativo
                  ? "bg-club-light font-medium text-ink-900"
                  : "text-ink-500 hover:bg-surface hover:text-ink-900"
              }`}
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
