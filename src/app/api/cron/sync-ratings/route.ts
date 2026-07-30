export const dynamic = "force-dynamic";

// POST /api/cron/sync-ratings
// Scrape les stats détaillées de boxscore lnh.fr (note LNH + buts/passes/ballons
// récupérés/etc., src/lib/stats/stat-lines.ts) pour les matchs du jour (J+1 matin),
// journée par journée (syncGameweekBoxscore, src/lib/ingestion/boxscore.ts — même
// pipeline que le Mode Simulation, cf. src/lib/simulation/advance.ts).
// Paramètre ?gameweek=N ou ?matchId=ID
// Si le scraper échoue → IngestionError catchée, retourne { error, recoverable: true }
// ARCHITECTURE.md §4.1 : cron 09h et 13h quotidien

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { IngestionError } from "@/lib/data-providers/lnh-scraper.provider";
import { syncCalendarsIdsForSeason, syncGameweekBoxscore } from "@/lib/ingestion/boxscore";
import { verifyCronAuth } from "@/lib/cron-auth";

const LNH_SEASONS_ID_2026_2027 = "40";
const SEASON_START_YEAR_2026_2027 = 2026;

export async function POST(req: Request) {
  if (!(await verifyCronAuth(req))) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Cron secret invalide" } }, { status: 401 });
  }

  const url = new URL(req.url);
  const gameweekParam = url.searchParams.get("gameweek");
  const matchIdParam = url.searchParams.get("matchId");

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json(
      { error: { code: "NO_SEASON", message: "Aucune saison active" } },
      { status: 400 }
    );
  }

  try {
    // Résolution des calendars_id manquants + Match.status/scores depuis lnh.fr — un
    // seul fetch pour toute la saison, idempotent. Fait AVANT la détection des
    // journées à synchroniser ci-dessous : le mode par défaut (sans ?gameweek/
    // ?matchId) filtre sur `status: "FINISHED"`, qui vient d'être mis à jour par cet
    // appel — l'inverser retarderait la détection d'un jour (le statut ne serait à
    // jour qu'au run suivant).
    await syncCalendarsIdsForSeason(season.id, LNH_SEASONS_ID_2026_2027, SEASON_START_YEAR_2026_2027);
  } catch (err) {
    const recoverable = err instanceof IngestionError ? err.recoverable : false;
    console.warn("[sync-ratings] syncCalendarsIdsForSeason:", String(err));
    if (!recoverable) {
      return NextResponse.json({ error: { code: "SCRAPER_ERROR", message: String(err) } }, { status: 502 });
    }
  }

  // Détermine les journées à synchroniser
  const gameweekIds = new Set<string>();

  if (matchIdParam) {
    const m = await prisma.match.findUnique({ where: { id: matchIdParam }, select: { gameweekId: true } });
    if (m) gameweekIds.add(m.gameweekId);
  } else if (gameweekParam) {
    const gwNum = parseInt(gameweekParam, 10);
    const gw = await prisma.gameweek.findUnique({
      where: { seasonId_number: { seasonId: season.id, number: gwNum } },
      select: { id: true },
    });
    if (gw) gameweekIds.add(gw.id);
  } else {
    // Défaut : journées des matchs terminés hier
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const today = new Date();
    const recentMatches = await prisma.match.findMany({
      where: { seasonId: season.id, status: "FINISHED", kickoffAt: { gte: yesterday, lt: today } },
      select: { gameweekId: true },
    });
    for (const m of recentMatches) gameweekIds.add(m.gameweekId);
  }

  if (gameweekIds.size === 0) {
    return NextResponse.json({ data: { message: "Aucune journée à scraper", scraped: 0 } });
  }

  const results: { gameweekId: string; status: "ok" | "error"; detail: string }[] = [];

  for (const gameweekId of gameweekIds) {
    try {
      const sync = await syncGameweekBoxscore(gameweekId, LNH_SEASONS_ID_2026_2027);
      results.push({
        gameweekId,
        status: "ok",
        detail: `J${sync.gameweekNumber} : ${sync.matchesProcessed} match(s), ${sync.statsUpserted} stats`,
      });
    } catch (err) {
      const recoverable = err instanceof IngestionError ? err.recoverable : false;
      console.warn(`[sync-ratings] gameweek=${gameweekId}:`, String(err));
      results.push({ gameweekId, status: "error", detail: String(err) });
      if (!recoverable) break;
    }
  }

  const successCount = results.filter((r) => r.status === "ok").length;
  return NextResponse.json({
    data: {
      scraped: successCount,
      failed: results.length - successCount,
      results,
    },
  });
}