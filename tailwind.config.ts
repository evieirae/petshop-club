import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import { palette, shape } from "./lib/design/tokens";

/**
 * NÃO escreva cores aqui. Todas vêm de lib/design/tokens.ts — este arquivo só
 * traduz aquele objeto em (a) classes utilitárias do Tailwind e (b) CSS
 * variables em :root, para que exista uma fonte única de verdade.
 *
 * As CSS variables (--color-brand-500, --color-ink-900, ...) existem para os
 * casos em que uma classe não serve: `style` inline, canvas/gráfico, SVG
 * gerado em runtime, e-mail. Elas são derivadas do mesmo objeto, então nunca
 * saem de sincronia com as classes.
 */

/** Achata { brand: { 500: "#..." } } em { "brand-500": "#..." } pras CSS vars. */
function flatten(obj: Record<string, unknown>, prefixo = ""): Record<string, string> {
  return Object.entries(obj).reduce<Record<string, string>>((acc, [chave, valor]) => {
    const nome = chave === "DEFAULT" ? prefixo.replace(/-$/, "") : `${prefixo}${chave}`;
    if (typeof valor === "string") {
      acc[nome] = valor;
    } else if (valor && typeof valor === "object") {
      Object.assign(acc, flatten(valor as Record<string, unknown>, `${nome}-`));
    }
    return acc;
  }, {});
}

const cssVars = Object.entries(flatten(palette as unknown as Record<string, unknown>)).reduce<
  Record<string, string>
>((acc, [nome, valor]) => {
  acc[`--color-${nome}`] = valor;
  return acc;
}, {});

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: palette.brand,
        success: palette.success,
        cta: palette.cta,
        danger: palette.danger,
        progress: palette.progress,
        ink: palette.ink,
        surface: palette.surface,
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        sans: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
      borderRadius: {
        pill: shape.radius.pill,
        /** Alias legado do antigo "carimbo" — mesmo valor de `pill`. */
        stamp: shape.radius.pill,
      },
      boxShadow: {
        card: shape.shadow.card,
        raised: shape.shadow.raised,
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({ ":root": cssVars });
    }),
  ],
};

export default config;
