import type { Metadata } from "next";
import { Barlow_Condensed, Inter, VT323 } from "next/font/google";
import { Providers } from "@/components/Providers";
import { CookieBanner } from "@/components/CookieBanner";
import "./globals.css";

// Typographie — ARCHITECTURE.md §8.1
const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-display",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

// Police "borne d'arcade" — réservée aux valeurs numériques (points, deadline, prix) — ARCHITECTURE.md §8.1
const arcade = VT323({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-arcade",
});

export const metadata: Metadata = {
  title: "Starligue Fantasy",
  description: "Le fantasy handball de la Liqui Moly Starligue.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${display.variable} ${sans.variable} ${arcade.variable}`}>
      <body>
        <Providers>{children}</Providers>
        <CookieBanner />
      </body>
    </html>
  );
}
