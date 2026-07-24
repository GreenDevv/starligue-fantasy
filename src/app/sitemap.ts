import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://starliguefantasy.fr";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/starligue`, changeFrequency: "daily", priority: 0.8 },
    { url: `${siteUrl}/register`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${siteUrl}/confidentialite`, changeFrequency: "yearly", priority: 0.2 },
  ];

  const news = await prisma.newsItem.findMany({
    orderBy: { publishedAt: "desc" },
    take: 500,
    select: { id: true, publishedAt: true },
  });

  const newsRoutes: MetadataRoute.Sitemap = news.map((item) => ({
    url: `${siteUrl}/starligue/${item.id}`,
    lastModified: item.publishedAt,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [...staticRoutes, ...newsRoutes];
}
