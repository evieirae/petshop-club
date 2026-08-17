import { cx } from "@/lib/ui/styles";

/**
 * Logo do PetClub.
 *
 * O símbolo é SVG inline (não <img>): não gera request extra, fica nítido em
 * qualquer tamanho e herda cor via `currentColor`/tokens. O logotipo textual é
 * texto HTML de verdade — usa a fonte já carregada do app, é selecionável e
 * lido por leitor de tela.
 *
 * Os arquivos estáticos equivalentes ficam em public/ (petclub-logo.svg,
 * petclub-logo-branco.svg, petclub-symbol.svg) para uso fora do React:
 * favicon, e-mail, WhatsApp, apresentação, assinatura.
 *
 *   <Logo />                            marca completa, tamanho médio
 *   <Logo variante="simbolo" />         só o símbolo (avatar, favicon inline)
 *   <Logo tom="branco" />               sobre fundo azul/escuro
 */

const TAMANHO_SIMBOLO = {
  sm: "h-7 w-7",
  md: "h-9 w-9",
  lg: "h-16 w-16",
} as const;

const TAMANHO_TEXTO = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-3xl",
} as const;

export type TamanhoLogo = keyof typeof TAMANHO_SIMBOLO;

export function LogoSimbolo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* O círculo usa currentColor — quem chama define a cor pelo texto. */}
      <circle cx="50" cy="50" r="50" fill="currentColor" />
      <g className="fill-surface-card">
        <ellipse cx="24.5" cy="41" rx="7.6" ry="10" transform="rotate(-24 24.5 41)" />
        <ellipse cx="40.3" cy="29.5" rx="7.6" ry="11" transform="rotate(-8 40.3 29.5)" />
        <ellipse cx="59.7" cy="29.5" rx="7.6" ry="11" transform="rotate(8 59.7 29.5)" />
        <ellipse cx="75.5" cy="41" rx="7.6" ry="10" transform="rotate(24 75.5 41)" />
        <path d="M50 82.5c-3.2-1.6-19.5-11.6-19.5-22.2 0-6.5 4.9-11.1 10.6-11.1 4.4 0 7.8 2.7 8.9 6.5 1.1-3.8 4.5-6.5 8.9-6.5 5.7 0 10.6 4.6 10.6 11.1 0 10.6-16.3 20.6-19.5 22.2Z" />
      </g>
    </svg>
  );
}

export function Logo({
  variante = "completa",
  tamanho = "md",
  tom = "cor",
  className,
}: {
  variante?: "completa" | "simbolo";
  tamanho?: TamanhoLogo;
  /** "branco" inverte o símbolo e o texto, para fundo azul/escuro. */
  tom?: "cor" | "branco";
  className?: string;
}) {
  const corSimbolo = tom === "branco" ? "text-surface-card" : "text-brand-500";

  if (variante === "simbolo") {
    return (
      <span
        className={cx("inline-flex", corSimbolo, className)}
        role="img"
        aria-label="PetClub"
      >
        <LogoSimbolo className={TAMANHO_SIMBOLO[tamanho]} />
      </span>
    );
  }

  return (
    <span
      className={cx("inline-flex items-center gap-2.5", className)}
      role="img"
      aria-label="PetClub"
    >
      <span className={corSimbolo}>
        <LogoSimbolo className={TAMANHO_SIMBOLO[tamanho]} />
      </span>
      <span
        aria-hidden="true"
        className={cx(
          "font-sans font-bold leading-none tracking-tight",
          TAMANHO_TEXTO[tamanho],
          tom === "branco" ? "text-surface-card" : "text-ink-900",
        )}
      >
        PetClub
      </span>
    </span>
  );
}
