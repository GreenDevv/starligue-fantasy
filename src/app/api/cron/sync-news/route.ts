// POST /api/cron/sync-news — ARCHITECTURE.md §6.7/§10 (quotidien, 0 7 * * *)
// Scrape toutes les sources enregistrées (lnh.fr + clubs, src/lib/data-providers/news/registry.ts),
// classe (src/lib/news/classify.ts), dédoublonne (exact par dedupeKey + quasi-doublon
// cross-source, src/lib/news/dedupe.ts) et upsert les nouveaux NewsItem. Une source en
// panne n'interrompt jamais les autres (même convention défensive que le reste de
// l'ingestion, ARCHITECTURE.md §3.2/§15).
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron-auth";
import { NEWS_PROVIDERS } from "@/lib/data-providers/news/registry";
import type { ScrapedNewsItem } from "@/lib/data-providers/news/types";
import { classifyNewsCategory } from "@/lib/news/classify";
import { findNearDuplicate, type DedupeCandidate } from "@/lib/news/dedupe";

const RECENT_WINDOW_DAYS = 7;

function hashUrl(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 16);
}

interface SourceSummary {
  fetched: number;
  inserted: number;
  duplicates: number;
  error: string | null;
}

export async function POST(req: Request) {
  if (!(await verifyCronAuth(req))) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Cron secret invalide" } }, { status: 401 });
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ error: { code: "NO_SEASON", message: "Aucune saison active" } }, { status: 400 });
  }

  const dbClubs = await prisma.club.findMany({ select: { id: true, externalIds: true } });
  const clubIdBySlug = new Map<string, string>();
  for (const c of dbClubs) {
    const extIds = (c.externalIds as Record<string, string>) ?? {};
    if (extIds.lnh) clubIdBySlug.set(extIds.lnh.toLowerCase(), c.id);
  }

  const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const recent = await prisma.newsItem.findMany({
    where: { seasonId: season.id, publishedAt: { gte: since } },
    select: { title: true, publishedAt: true, category: true, clubId: true },
  });
  const recentCandidates: DedupeCandidate[] = recent.map((r) => ({
    title: r.title,
    publishedAt: r.publishedAt,
    category: r.category,
    clubId: r.clubId,
  }));

  const perSource: Record<string, SourceSummary> = {};

  for (const provider of NEWS_PROVIDERS) {
    const summary: SourceSummary = { fetched: 0, inserted: 0, duplicates: 0, error: null };
    try {
      const scraped: ScrapedNewsItem[] = await provider.fetchNews();
      summary.fetched = scraped.length;

      for (const item of scraped) {
        const category = classifyNewsCategory(item.title, item.excerpt);
        const clubId = item.clubExternalSlug ? clubIdBySlug.get(item.clubExternalSlug.toLowerCase()) ?? null : null;

        const candidate: DedupeCandidate = { title: item.title, publishedAt: item.publishedAt, category, clubId };
        if (findNearDuplicate(candidate, recentCandidates)) {
          summary.duplicates++;
          continue;
        }

        // Idempotence exacte par source (reruns du même run/jour sur le même article) :
        // vérifiée avant insertion plutôt qu'un upsert, pour distinguer proprement
        // "déjà connu" (compté en duplicates) de "nouveau" dans le résumé retourné.
        const dedupeKey = `${provider.sourceKey}:${hashUrl(item.sourceUrl)}`;
        const existing = await prisma.newsItem.findUnique({ where: { dedupeKey }, select: { id: true } });
        if (existing) {
          summary.duplicates++;
          continue;
        }

        // Texte intégral : déjà présent pour certaines sources (WordPress renvoie
        // content.rendered gratuitement dans le listing), sinon récupéré à la demande —
        // UNIQUEMENT ici, pour un item confirmé nouveau (jamais pour un doublon déjà
        // connu), afin de ne pas multiplier les requêtes par 12-17 à chaque run.
        let content = item.content;
        if (content === null && provider.fetchArticleContent) {
          content = await provider.fetchArticleContent(item.sourceUrl);
        }

        await prisma.newsItem.create({
          data: {
            seasonId: season.id,
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
        // L'ajouter à la fenêtre récente pour que les items suivants de CE run (autre
        // source, même story publiée le même jour) puissent le détecter à leur tour.
        recentCandidates.push(candidate);
        summary.inserted++;
      }
    } catch (e) {
      summary.error = e instanceof Error ? e.message : String(e);
      console.error(`[sync-news] source=${provider.sourceKey}`, e);
    }
    perSource[provider.sourceKey] = summary;
  }

  return NextResponse.json({ data: { season: season.label, sources: perSource } });
}
