import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://starliguefantasy.fr";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
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
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
