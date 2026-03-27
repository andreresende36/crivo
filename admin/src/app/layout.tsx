import type { Metadata } from "next";
import { Plus_Jakarta_Sans, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const displayFont = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin"],
});

const sansFont = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const monoFont = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Crivo — Passou pelo Crivo",
  description: "Plataforma de automação inteligente para afiliados. Score de 7 critérios, anti-pricejacking e distribuição automática de ofertas.",
  openGraph: {
    title: "Crivo — Painel Administrativo",
    description: "Automatize seus grupos de ofertas com IA. Filtragem inteligente de marketplaces para WhatsApp e Telegram.",
    url: "https://crivo.app",
    siteName: "Crivo",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${displayFont.variable} ${sansFont.variable} ${monoFont.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full font-sans antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
