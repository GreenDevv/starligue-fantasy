// Logique de synchro des actus (lnh.fr + sites de clubs), partagée entre le cron
// quotidien (src/app/api/cron/sync-news/route.ts) et le déclenchement manuel admin
// (src/app/api/admin/news/sync/route.ts). Comportement quasi identique entre les
// deux, à une exception près (§ options.windowDays ci-dessous), demandée
// explicitement le 2026-08-07 : un run manuel élargit la fenêtre à quelques jours
// en arrière et met les articles au-delà d'aujourd'hui en attente de validation
// admin plutôt que de les publier tout seuls (voir PendingNewsItem ci-dessous,
// consommé par POST /api/admin/news/sync/confirm qui refait l'insertion à
// l'identique une fois l'admin d'accord) — le cron quotidien, lui, n'appelle
// jamais cette option et garde son comportement historique "aujourd'hui
// uniquement, tout auto-publié".
import { createHash } from "node:crypto";
import type { NewsCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NEWS_PROVIDERS } from "@/lib/data-providers/news/registry";
import type { NewsSourceProvider, ScrapedNewsItem } from "@/lib/data-providers/news/types";
import { classifyNewsCategory } from "@/lib/news/classify";
import { findNearDuplicate, type DedupeCandidate } from "@/lib/news/dedupe";

// Exporté : réutilisé par POST /api/admin/news/sync/confirm pour rejouer le même
// contrôle de quasi-doublon qu'ici au moment de la publication d'un item pending.
export const RECENT_WINDOW_DAYS = 7;

export function hashUrl(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 16);
}

// Article scrapé plus vieux qu'aujourd'hui mais dans la fenêtre élargie
// (options.windowDays) : pas inséré en base, juste renvoyé pour que l'admin décide
// de le publier ou non (POST /api/admin/news/sync/confirm, qui refait exactement
// l'insertion ci-dessous à partir de ces mêmes champs).
export interface PendingNewsItem {
  sourceKey: string;
  sourceType: NewsSourceProvider["sourceType"];
  category: NewsCategory;
  title: string;
  excerpt: string | null;
  content: string | null;
  sourceUrl: string;
  imageUrl: string | null;
  publishedAt: string; // ISO — traverse la réponse API JSON jusqu'au clic "Publier"
  clubId: string | null;
}

export interface NewsSourceSummary {
  fetched: number;
  inserted: number;
  duplicates: number;
  tooOld: number;
  pending: PendingNewsItem[];
  error: string | null;
}

export async function runNewsSync(
  seasonId: string,
  options?: { windowDays?: number }
): Promise<Record<string, NewsSourceSummary>> {
  // Ne récupère que les actus publiées aujourd'hui ou plus tard — évite de
  // ressortir du backlog ancien (et notamment des actus qu'un admin vient de
  // supprimer : deletedAt les protège déjà de la réinsertion, mais ce filtre de
  // date évite en plus de repêcher de vieux articles jamais vus jusque-là).
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // windowDays=3 → couvre aujourd'hui + les 2 jours précédents (extendedCutoff =
  // todayStart - 2 jours). Un item entre extendedCutoff et todayStart n'est ni
  // auto-publié ni compté "tooOld" : voir PendingNewsItem ci-dessus.
  const extendedCutoff = options?.windowDays
    ? new Date(todayStart.getTime() - (options.windowDays - 1) * 24 * 60 * 60 * 1000)
    : null;

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
    const summary: NewsSourceSummary = { fetched: 0, inserted: 0, duplicates: 0, tooOld: 0, pending: [], error: null };
    try {
      const scraped: ScrapedNewsItem[] = await provider.fetchNews();
      summary.fetched = scraped.length;

      for (const item of scraped) {
        const isToday = item.publishedAt >= todayStart;
        const isInExtendedWindow = !isToday && extendedCutoff !== null && item.publishedAt >= extendedCutoff;
        if (!isToday && !isInExtendedWindow) {
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

        // Un item de la fenêtre élargie (run manuel, plus vieux qu'aujourd'hui) n'est
        // jamais auto-publié — il attend une confirmation explicite (POST
        // /api/admin/news/sync/confirm, qui refait l'insertion ci-dessous à
        // l'identique). Ajouté quand même à recentCandidates pour qu'une même actu
        // vue sur une autre source plus loin dans cette boucle ne soit pas suggérée
        // deux fois.
        if (!isToday) {
          summary.pending.push({
            sourceKey: provider.sourceKey,
            sourceType: provider.sourceType,
            category,
            title: item.title,
            excerpt: item.excerpt,
            content,
            sourceUrl: item.sourceUrl,
            imageUrl: item.imageUrl,
            publishedAt: item.publishedAt.toISOString(),
            clubId,
          });
          recentCandidates.push(candidate);
          continue;
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
