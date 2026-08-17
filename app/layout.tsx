import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { palette } from "@/lib/design/tokens";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
};

/** Cor da barra do navegador no mobile — Azul Confiança (brand.500). */
export const viewport: Viewport = {
  themeColor: palette.brand[500],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body
        className={`${fraunces.variable} ${inter.variable} ${plexMono.variable} font-sans bg-surface text-ink-900 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
