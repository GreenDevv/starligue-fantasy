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
  // localePrefix "always" : toutes les langues (y compris le FR par défaut) sont préfixées.
  const disallow = routing.locales.flatMap((locale) => DISALLOW_BASE.map((p) => `/${locale}${p}`));

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow,
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
