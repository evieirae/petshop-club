"use client";

import { useState, useTransition } from "react";
import { Palette as IconePaleta, Check } from "lucide-react";
import { temas, NOME_TEMA, type Tema } from "@/lib/design/tokens";
import { definirTema } from "@/lib/design/tema.actions";
import { cx } from "@/lib/ui/styles";

/**
 * Troca de tema (Ardósia/Vinho/Escuro/Marinho). Vive na Topbar.
 *
 * A troca é 100% client-side (só troca o atributo `data-tema` em <html>,
 * que é o que toda a paleta em CSS variable escuta — ver tailwind.config.ts)
 * e só DEPOIS persiste no cookie via Server Action, pra feedback instantâneo
 * mesmo em conexão lenta. Não faz `router.refresh()`: nada renderizado no
 * servidor depende do tema, então não há nada pra re-buscar.
 */
export function ThemeSwitcher({ temaInicial }: { temaInicial: Tema }) {
  const [aberto, setAberto] = useState(false);
  const [temaAtual, setTemaAtual] = useState<Tema>(temaInicial);
  const [, iniciarTransicao] = useTransition();

  function escolher(tema: Tema) {
    setTemaAtual(tema);
    document.documentElement.setAttribute("data-tema", tema);
    setAberto(false);
    iniciarTransicao(() => {
      definirTema(tema);
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Trocar tema"
        title="Trocar tema"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-surface-muted hover:text-ink-900"
      >
        <IconePaleta size={17} aria-hidden="true" />
      </button>

      {aberto && (
        <>
          {/* Fecha ao clicar fora — camada invisível atrás do menu. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setAberto(false)}
          />
          <div
            role="menu"
            className="absolute right-0 top-full z-20 mt-2 w-40 overflow-hidden rounded-xl border border-surface-border bg-surface-card py-1 shadow-raised"
          >
            {temas.map((tema) => (
              <button
                key={tema}
                type="button"
                role="menuitemradio"
                aria-checked={tema === temaAtual}
                onClick={() => escolher(tema)}
                className={cx(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-muted",
                  tema === temaAtual ? "font-medium text-brand-700" : "text-ink-700",
                )}
              >
                {NOME_TEMA[tema]}
                {tema === temaAtual && <Check size={14} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
