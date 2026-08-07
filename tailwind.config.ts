import type { Config } from "tailwindcss";

// Tokens do produto — ver docs/design-tokens.md para o racional de cada escolha.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#16302D",
          700: "#2E4A46",
          500: "#5B7873",
        },
        surface: {
          DEFAULT: "#F3F6F4",
          card: "#FFFFFF",
          border: "#DDE3DF",
        },
        club: {
          // Acento primario: mel/mostarda — evoca shampoo, toalha, calor.
          DEFAULT: "#C99A3E",
          dark: "#A87E30",
          light: "#F1DFB4",
        },
        confirmado: {
          DEFAULT: "#4F7A5C",
          bg: "#E4EEE6",
        },
        pendente: {
          DEFAULT: "#B85C42",
          bg: "#F5E4DE",
        },
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        sans: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
      borderRadius: {
        stamp: "9999px",
      },
    },
  },
  plugins: [],
};

export default config;
