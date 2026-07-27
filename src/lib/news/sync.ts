// Logique de synchro des actus (lnh.fr + sites de clubs), partagée entre le cron
// quotidien (src/app/api/cron/sync-news/route.ts) et le déclenchement manuel admin
// (src/app/api/admin/news/sync/route.ts) — même comportement, deux points d'entrée.
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { NEWS_PROVIDERS } from "@/lib/data-providers/news/registry";
import type { ScrapedNewsItem } from "@/lib/data-providers/news/types";
import { classifyNewsCategory } from "@/lib/news/classify";
import { findNearDuplicate, type DedupeCandidate } from "@/lib/news/dedupe";

const RECENT_WINDOW_DAYS = 7;

function hashUrl(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 16);
}

export interface NewsSourceSummary {
  fetched: number;
  inserted: number;
  duplicates: number;
  tooOld: number;
  error: string | null;
}

export async function runNewsSync(seasonId: string): Promise<Record<string, NewsSourceSummary>> {
  // Ne récupère que les actus publiées aujourd'hui ou plus tard — évite de
  // ressortir du backlog ancien (et notamment des actus qu'un admin vient de
  // supprimer : deletedAt les protège déjà de la réinsertion, mais ce filtre de
  // date évite en plus de repêcher de vieux articles jamais vus jusque-là).
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const dbClubs = await prisma.club.findMany({ select: { id: true, externalIds: true } });
  const clubIdBySlug = new Map<string, string>();
  for (const c of dbClubs) {
    const extIds = (c.externalIds as Record<string, string>) ?? {};
    if (extIds.lnh) clubIdBySlug.set(extIds.lnh.toLowerCase(), c.id);
  }

  const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const recent = await prisma.newsItem.findMany({
    where: { seasonId, publishedAt: { gte: since } },
    select: { title: true, publishedAt: true, category: true, clubId: true },
  });
  const recentCandidates: DedupeCandidate[] = recent.map((r) => ({
    title: r.title,
    publishedAt: r.publishedAt,
    category: r.category,
    clubId: r.clubId,
  }));

  const perSource: Record<string, NewsSourceSummary> = {};

  for (const provider of NEWS_PROVIDERS) {
    const summary: NewsSourceSummary = { fetched: 0, inserted: 0, duplicates: 0, tooOld: 0, error: null };
    try {
      const scraped: ScrapedNewsItem[] = await provider.fetchNews();
      summary.fetched = scraped.length;

      for (const item of scraped) {
        if (item.publishedAt < todayStart) {
          summary.tooOld++;
          continue;
        }

        const category = classifyNewsCategory(item.title, item.excerpt);
        const clubId = item.clubExternalSlug ? clubIdBySlug.get(item.clubExternalSlug.toLowerCase()) ?? null : null;

        const candidate: DedupeCandidate = { title: item.title, publishedAt: item.publishedAt, category, clubId };
        if (findNearDuplicate(candidate, recentCandidates)) {
          summary.duplicates++;
          continue;
        }

        const dedupeKey = `${provider.sourceKey}:${hashUrl(item.sourceUrl)}`;
        const existing = await prisma.newsItem.findUnique({ where: { dedupeKey }, select: { id: true } });
        if (existing) {
          summary.duplicates++;
          continue;
        }

        let content = item.content;
        if (content === null && provider.fetchArticleContent) {
          content = await provider.fetchArticleContent(item.sourceUrl);
        }

        await prisma.newsItem.create({
          data: {
            seasonId,
            category,
            sourceType: provider.sourceType,
            sourceKey: provider.sourceKey,
            title: item.title,
            excerpt: item.excerpt,
            content,
            sourceUrl: item.sourceUrl,
            imageUrl: item.imageUrl,
            publishedAt: item.publishedAt,
            dedupeKey,
            clubId,
          },
        });
        recentCandidates.push(candidate);
        summary.inserted++;
      }
    } catch (e) {
      summary.error = e instanceof Error ? e.message : String(e);
      console.error(`[sync-news] source=${provider.sourceKey}`, e);
    }
    perSource[provider.sourceKey] = summary;
  }

  return perSource;
}
