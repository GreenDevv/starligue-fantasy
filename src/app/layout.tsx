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

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://starliguefantasy.fr";
const siteDescription =
  "Starligue Fantasy, le jeu de fantasy handball basé sur la Daikin Starligue. Compose ton équipe avec les vrais joueurs de handball D1, marque des points chaque journée et défie tes amis.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Starligue Fantasy — le jeu de fantasy handball",
    template: "%s · Starligue Fantasy",
  },
  description: siteDescription,
  keywords: [
    "fantasy handball",
    "handball",
    "Starligue",
    "Daikin Starligue",
    "jeu fantasy handball",
    "handball D1",
    "pronostics handball",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: siteUrl,
    siteName: "Starligue Fantasy",
    title: "Starligue Fantasy — le jeu de fantasy handball",
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: "Starligue Fantasy — le jeu de fantasy handball",
    description: siteDescription,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "Starligue Fantasy",
      url: siteUrl,
      description: siteDescription,
      inLanguage: "fr-FR",
    },
    {
      "@type": "Organization",
      name: "Starligue Fantasy",
      url: siteUrl,
      description:
        "Jeu de fantasy handball indépendant, sans rapport officiel avec la LNH ou la Daikin Starligue.",
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${display.variable} ${sans.variable} ${arcade.variable}`}>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <Providers>{children}</Providers>
        <CookieBanner />
      </body>
    </html>
  );
}
