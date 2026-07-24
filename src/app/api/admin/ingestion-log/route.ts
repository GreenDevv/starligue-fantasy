export const dynamic = "force-dynamic";

// GET /api/admin/ingestion-log — statut des providers et derniers crons
// Pour v1 : retourne l'état des providers (API-Sports: clé configurée? LNH: accessible?)
// ARCHITECTURE.md §6.6

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createLnhScraperProvider } from "@/lib/data-providers/lnh-scraper.provider";
import { NEWS_PROVIDERS } from "@/lib/data-providers/news/registry";

const NEWS_SOURCE_STALE_AFTER_MS = 36 * 60 * 60 * 1000; // 36h — sync-news tourne 1x/jour (0 7 * * *)

async function requireAdmin() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") return null;
  return session;
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Accès refusé" } }, { status: 403 });
  }

  const url = new URL(req.url);
  const probe = url.searchParams.get("probe") === "1";

  const [season, recentMatches] = await Promise.all([
    prisma.season.findFirst({ where: { isActive: true } }),
    prisma.match.findMany({
      where: { status: "FINISHED" },
      orderBy: { kickoffAt: "desc" },
      take: 5,
      select: {
        id: true,
        kickoffAt: true,
        homeClub: { select: { shortName: true } },
        awayClub: { select: { shortName: true } },
        gameweek: { select: { number: true } },
        _count: { select: { playerStats: true } },
      },
    }),
  ]);

  const apiSportsConfigured = Boolean(process.env.API_SPORTS_KEY);
  const lnhApiUrl = process.env.LNH_API_BASE_URL ?? null;

  let lnhProbeResult: { accessible: boolean; playersEndpoint: boolean } | null = null;
  if (probe) {
    const lnhProvider = createLnhScraperProvider();
    lnhProbeResult = await lnhProvider.probe();
  }

  // Dernier NewsItem par source (lnh + clubs), pas de table de log dédiée — un
  // sourceKey n'ayant produit aucune actu récemment est visible sans bloquer les autres.
  const lastNewsBySource = await prisma.newsItem.groupBy({
    by: ["sourceKey"],
    where: { sourceType: { in: ["LNH_SITE", "CLUB_SITE"] } },
    _max: { createdAt: true },
  });
  const lastNewsAt = new Map(lastNewsBySource.map((r) => [r.sourceKey, r._max.createdAt]));
  const newsStatus: Record<string, { lastRunAt: Date | null; ok: boolean }> = {};
  for (const provider of NEWS_PROVIDERS) {
    const lastRunAt = lastNewsAt.get(provider.sourceKey) ?? null;
    newsStatus[provider.sourceKey] = {
      lastRunAt,
      ok: lastRunAt !== null && Date.now() - lastRunAt.getTime() < NEWS_SOURCE_STALE_AFTER_MS,
    };
  }

  return NextResponse.json({
    data: {
      providers: {
        apiSports: {
          configured: apiSportsConfigured,
          leagueId: process.env.API_SPORTS_LEAGUE_ID ?? "27 (défaut)",
        },
        lnhScraper: {
          apiUrl: lnhApiUrl,
          probeResult: lnhProbeResult,
        },
        news: newsStatus,
      },
      activeSeason: season ? { id: season.id, label: season.label } : null,
      recentMatches: recentMatches.map((m) => ({
        id: m.id,
        gameweek: m.gameweek.number,
        match: `${m.homeClub.shortName} - ${m.awayClub.shortName}`,
        kickoffAt: m.kickoffAt,
        statsCount: m._count.playerStats,
      })),
    },
  });
}