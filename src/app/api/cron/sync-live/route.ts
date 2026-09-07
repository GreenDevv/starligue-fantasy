export const dynamic = "force-dynamic";

// POST /api/cron/sync-live — Lot 1 du « Centre live » (voir mémoire
// live_match_center_vision).
//
// Pendant un créneau de match (au moins une rencontre Starligue dont le coup
// d'envoi tombe dans [now-3h, now+30min]), rafraîchit rapidement :
//   - Match.status / homeScore / awayScore   (calendrier lnh.fr, syncCalendarsIdsForSeason)
//   - le snapshot ClubStanding de la journée  (classement officiel lnh.fr)
// Les deux sont idempotents ; hors créneau la route ne fait rien ({ skipped }).
//
// Déclenché toutes les ~5 min les soirs de match par .github/workflows/cron-live.yml.
// N'INGÈRE PAS le boxscore (notes / stats détaillées) : ça reste sync-ratings, une
// fois la journée finie (cf. gameweek_close_and_matchday_pack). Le vrai suivi
// minute-par-minute (feed eStatsChannels) = Lot 2.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron-auth";
import { IngestionError } from "@/lib/data-providers/lnh-scraper.provider";
import { syncCalendarsIdsForSeason } from "@/lib/ingestion/boxscore";
import { syncLiveClubStandings } from "@/lib/standings/live-sync";

const LNH_SEASONS_ID = "40";
const SEASON_START_YEAR = 2026;
const WINDOW_BEFORE_MS = 30 * 60 * 1000; // un match commence "bientôt"
const WINDOW_AFTER_MS = 3 * 60 * 60 * 1000; // un match de handball dure ~2h + rab

export async function POST(req: Request) {
  if (!(await verifyCronAuth(req))) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ error: { code: "NO_SEASON" } }, { status: 400 });
  }

  const now = Date.now();
  const force = new URL(req.url).searchParams.get("force") === "true";
  const nearbyMatch = await prisma.match.findFirst({
    where: {
      seasonId: season.id,
      kickoffAt: {
        gte: new Date(now - WINDOW_AFTER_MS),
        lte: new Date(now + WINDOW_BEFORE_MS),
      },
      status: { in: ["SCHEDULED", "LIVE"] },
    },
    select: { id: true, kickoffAt: true },
  });

  if (!nearbyMatch && !force) {
    return NextResponse.json({ data: { skipped: true, reason: "aucun match dans le créneau" } });
  }

  const out: { results?: unknown; standings?: unknown; errors: string[] } = { errors: [] };

  try {
    out.results = await syncCalendarsIdsForSeason(season.id, LNH_SEASONS_ID, SEASON_START_YEAR);
  } catch (err) {
    const recoverable = err instanceof IngestionError ? err.recoverable : false;
    console.warn("[sync-live] calendars:", String(err));
    out.errors.push(`calendars: ${String(err)}`);
    if (!recoverable) return NextResponse.json({ error: { code: "SCRAPER_ERROR", message: String(err) } }, { status: 502 });
  }

  // Journée en cours = dernière avec au moins un match terminé (0 en pré-saison).
  const lastFinished = await prisma.gameweek.findFirst({
    where: { seasonId: season.id, matches: { some: { status: "FINISHED" } } },
    orderBy: { number: "desc" },
    select: { number: true },
  });

  try {
    out.standings = await syncLiveClubStandings(season.id, LNH_SEASONS_ID, lastFinished?.number ?? 0);
  } catch (err) {
    console.warn("[sync-live] standings:", String(err));
    out.errors.push(`standings: ${String(err)}`);
  }

  return NextResponse.json({ data: { triggeredBy: nearbyMatch?.id ?? "force", ...out } });
}
