"use client";

import { useState, type ReactNode } from "react";
import { cx } from "@/lib/ui/styles";

type Aba = "servicos" | "planos" | "produtos";

const ABAS: { chave: Aba; label: string }[] = [
  { chave: "servicos", label: "Serviços" },
  { chave: "planos", label: "Planos" },
  { chave: "produtos", label: "Produtos" },
];

// Abas do Catálogo (20/ago/2026). O conteúdo de cada aba chega pronto do
// server component (app/(app)/catalogo/page.tsx) como ReactNode — este
// componente só decide qual mostrar. Assim a página continua carregando os
// dados no servidor, sem transformar tudo em client component só por causa
// de um seletor de aba.
//
// As três abas juntas respondem "o que gera dinheiro pro pet": serviço
// avulso, plano recorrente e produto de prateleira. Cobrar/vender é a tela
// separada de Vendas.
export function CatalogoTabs({
  servicos,
  planos,
  produtos,
}: {
  servicos: ReactNode;
  planos: ReactNode;
  produtos: ReactNode;
}) {
  const [aba, setAba] = useState<Aba>("servicos");

  return (
    <div>
      <div
        role="tablist"
        aria-label="Seções do Catálogo"
        className="mb-8 inline-flex rounded-lg border border-surface-border bg-surface-muted p-1"
      >
        {ABAS.map((item) => (
          <button
            key={item.chave}
            type="button"
            role="tab"
            aria-selected={aba === item.chave}
            onClick={() => setAba(item.chave)}
            className={cx(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              aba === item.chave
                ? "bg-surface-card text-ink-900 shadow-card"
                : "text-ink-500 hover:text-ink-900",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {aba === "servicos" && servicos}
      {aba === "planos" && planos}
      {aba === "produtos" && produtos}
    </div>
  );
}
