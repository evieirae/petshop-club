"use client";

import { Logo } from "@/components/brand/Logo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  CalendarCheck,
  PawPrint,
  Users,
  Repeat,
  Settings,
  ShieldCheck,
  Wallet,
  ShoppingBag,
} from "lucide-react";
import { cx } from "@/lib/ui/styles";

const ITENS = [
  { href: "/painel", label: "Visão geral", icon: LayoutGrid },
  { href: "/agenda", label: "Agenda", icon: CalendarCheck },
  // Fase 4 (pedido de 18/ago/2026 — "cadastro pela plataforma do Pet"):
  // Pets vira a entidade principal do cadastro, antes de Tutores no menu.
  // Ver app/(app)/pets/page.tsx — o link "Ver tutor" de cada card leva pra
  // /tutores, que continua existindo pra tudo que é dado do TUTOR.
  { href: "/pets", label: "Pets", icon: PawPrint },
  { href: "/tutores", label: "Tutores", icon: Users },
  // 20/ago/2026 (pedido do Eduardo): antes eram "Planos & Serviços" e
  // "Produtos", e a de Produtos ainda tinha o ponto de venda dentro dela.
  // Agora a divisão é por TIPO DE TAREFA, não por tipo de item:
  //   Catálogo = cadastrar qualquer coisa que gere dinheiro (serviço, plano,
  //              produto), em abas dentro da mesma tela;
  //   Vendas   = cobrar/vender, a tarefa do balcão.
  // As rotas /planos e /produtos viraram redirects pra /catalogo.
  { href: "/catalogo", label: "Catálogo", icon: Repeat },
  { href: "/vendas", label: "Vendas", icon: ShoppingBag },
  // Fase 6 (docs/fase6_pagamentos.md) — rascunho, só funciona depois da
  // migration 0006 ser aplicada de verdade (ver aviso na própria página).
  { href: "/financeiro", label: "Financeiro", icon: Wallet },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

// So aparece pra quem tem linha em admins_plataforma (ver
// supabase/migrations/0017_admin_plataforma_independente.sql e
// lib/auth/getAdminContext.ts) — item separado, no fim, pra deixar claro
// que e uma area diferente do resto do menu (fica fora deste grupo de
// rota: enxerga TODOS os petshops, nao so o logado). Uma pessoa pode ter
// as duas identidades ao mesmo tempo (equipe de um petshop E admin da
// plataforma) — esse item só aparece pra ela por causa disso, não porque
// vira admin ao entrar aqui.
const ITEM_ADMIN = { href: "/admin", label: "Administração", icon: ShieldCheck };

export function Sidebar({ ehAdminPlataforma }: { ehAdminPlataforma: boolean }) {
  const pathname = usePathname();
  const itens = ehAdminPlataforma ? [...ITENS, ITEM_ADMIN] : ITENS;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-surface-border bg-surface-card px-3 py-6">
      <Link href="/painel" className="mb-8 rounded-lg px-2 py-1" aria-label="PetClub — início">
        <Logo tamanho="sm" />
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {itens.map(({ href, label, icon: Icon }) => {
          const ativo = href === "/painel" ? pathname === "/painel" : pathname.startsWith(href);
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
