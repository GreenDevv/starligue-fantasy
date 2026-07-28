import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://starliguefantasy.fr";

const DISALLOW_BASE = [
  "/api/",
  "/admin/",
  "/login",
  "/team",
  "/market",
  "/leagues",
  "/leaderboard",
  "/matches",
  "/players",
  "/clubs",
  "/dashboard",
];

export default function robots(): MetadataRoute.Robots {
  // localePrefix "as-needed" : le FR (défaut) n'a pas de préfixe, en/es/ca en ont un.
  const disallow = routing.locales.flatMap((locale) =>
    locale === routing.defaultLocale
      ? DISALLOW_BASE
      : DISALLOW_BASE.map((p) => `/${locale}${p}`)
  );

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow,
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
