import type { Metadata, Viewport } from "next";
import { Newsreader, Manrope, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { palette } from "@/lib/design/tokens";
import { getTemaAtual } from "@/lib/design/tema";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "PetClub",
    template: "%s · PetClub",
  },
  description: "Painel operacional do PetClub — clube de assinatura de banho e tosa.",
  // O favicon vem de app/icon.svg (convenção do App Router) — mesmo símbolo
  // de components/brand/Logo.tsx.
  icons: { icon: "/icon.svg" },
  // Verificação de domínio do Meta (Business Manager → Domínios).
  other: {
    "facebook-domain-verification": "6xkauhoffmqkm57hjzvyvkqpzj4wy6",
  },
};

/**
 * Cor da barra do navegador no mobile — brand.500 do tema PADRÃO.
 * O navegador não recalcula isso em runtime quando o usuário troca de tema
 * pelo ThemeSwitcher (é meta estático), então fica sempre a cor do tema
 * padrão — mesma limitação que qualquer app com theme-color fixo.
 */
export const viewport: Viewport = {
  themeColor: palette.brand[500],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Lido do cookie no servidor — o HTML já chega com o tema certo, sem
  // "flash" do tema padrão antes de hidratar (ver lib/design/tema.ts).
  const tema = getTemaAtual();

  return (
    <html lang="pt-BR" data-tema={tema}>
      <body
        className={`${newsreader.variable} ${manrope.variable} ${plexMono.variable} font-sans bg-surface text-ink-900 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
