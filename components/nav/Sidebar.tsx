"use client";

import { Logo } from "@/components/brand/Logo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  CalendarCheck,
  Users,
  Repeat,
  Settings,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { cx } from "@/lib/ui/styles";

const ITENS = [
  { href: "/", label: "Visão geral", icon: LayoutGrid },
  { href: "/agenda", label: "Agenda", icon: CalendarCheck },
  { href: "/tutores", label: "Tutores & Pets", icon: Users },
  { href: "/planos", label: "Planos & Serviços", icon: Repeat },
  // Fase 6 (docs/fase6_pagamentos.md) — rascunho, só funciona depois da
  // migration 0006 ser aplicada de verdade (ver aviso na própria página).
  { href: "/financeiro", label: "Financeiro", icon: Wallet },
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
      <Link href="/" className="mb-8 rounded-lg px-2 py-1" aria-label="PetClub — início">
        <Logo tamanho="sm" />
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {itens.map(({ href, label, icon: Icon }) => {
          const ativo = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={ativo ? "page" : undefined}
              className={cx(
                "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                ativo
                  ? // Barra azul à esquerda + fundo azul suave: o item ativo se
                    // identifica por posição e cor, não só por peso da fonte.
                    "bg-brand-50 font-medium text-brand-700 before:absolute before:left-0 before:top-1.5 before:h-[calc(100%-0.75rem)] before:w-0.5 before:rounded-pill before:bg-brand-500"
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
