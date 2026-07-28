import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { routing } from "@/i18n/routing";
import { getPathname } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://starliguefantasy.fr";

function urlFor(locale: string, href: string) {
  return `${siteUrl}${getPathname({ locale, href })}`;
}

function alternatesFor(href: string) {
  return Object.fromEntries(routing.locales.map((l) => [l, urlFor(l, href)]));
}

function entriesFor(
  href: string,
  extra: Omit<MetadataRoute.Sitemap[number], "url" | "alternates">
): MetadataRoute.Sitemap {
  return routing.locales.map((locale) => ({
    url: urlFor(locale, href),
    alternates: { languages: alternatesFor(href) },
    ...extra,
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    ...entriesFor("/", { changeFrequency: "daily", priority: 1 }),
    ...entriesFor("/starligue", { changeFrequency: "daily", priority: 0.8 }),
    ...entriesFor("/register", { changeFrequency: "monthly", priority: 0.6 }),
    ...entriesFor("/confidentialite", { changeFrequency: "yearly", priority: 0.2 }),
  ];

  const news = await prisma.newsItem.findMany({
    where: { deletedAt: null },
    orderBy: { publishedAt: "desc" },
    take: 500,
    select: { id: true, publishedAt: true },
  });

  const newsRoutes: MetadataRoute.Sitemap = news.flatMap((item) =>
    entriesFor(`/starligue/${item.id}`, {
      lastModified: item.publishedAt,
      changeFrequency: "monthly",
      priority: 0.5,
    })
  );

  return [...staticRoutes, ...newsRoutes];
}
