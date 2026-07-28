import type { Metadata } from "next";
import { Barlow_Condensed, Inter, VT323 } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { Providers } from "@/components/Providers";
import { CookieBanner } from "@/components/CookieBanner";
import { routing } from "@/i18n/routing";
import { getPathname } from "@/i18n/navigation";
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

const OG_LOCALE: Record<string, string> = {
  fr: "fr_FR",
  en: "en_US",
  es: "es_ES",
  ca: "ca_ES",
  de: "de_DE",
  pt: "pt_PT",
  da: "da_DK",
  pl: "pl_PL",
};

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const { locale } = params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  const description = t("description");
  const title = t("title");

  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, getPathname({ locale: l, href: "/" })])
  );

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: title,
      template: `%s · ${t("siteName")}`,
    },
    description,
    keywords: [
      "fantasy handball",
      "handball",
      "Starligue",
      "Daikin Starligue",
      "jeu fantasy handball",
      "handball D1",
      "pronostics handball",
    ],
    alternates: {
      canonical: getPathname({ locale, href: "/" }),
      languages: { ...languages, "x-default": "/" },
    },
    openGraph: {
      type: "website",
      locale: OG_LOCALE[locale] ?? "fr_FR",
      url: siteUrl,
      siteName: t("siteName"),
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

function jsonLd(locale: string, siteName: string, description: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: siteName,
        url: siteUrl,
        description,
        inLanguage: locale,
      },
      {
        "@type": "Organization",
        name: siteName,
        url: siteUrl,
        description:
          "Jeu de fantasy handball indépendant, sans rapport officiel avec la LNH ou la Daikin Starligue.",
      },
    ],
  };
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const { locale } = params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const messages = await getMessages();
  const t = await getTranslations({ locale, namespace: "metadata" });

  return (
    <html lang={locale} className={`${display.variable} ${sans.variable} ${arcade.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd(locale, t("siteName"), t("description"))),
          }}
        />
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
          <CookieBanner />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
