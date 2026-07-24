// POST /api/cron/sync-standings
// Scrape le classement officiel Daikin StarLigue (daikin-starligue/classement) pour
// la saison live 2026/2027 et snapshote l'état à la journée en cours (widget
// dashboard "Classement Starligue" — src/lib/standings). Idempotent : re-scraper la
// même journée met juste à jour le même snapshot.
// ARCHITECTURE.md §4.1 : à lancer soirs de journée, comme sync-results/sync-ratings.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { IngestionError } from "@/lib/data-providers/lnh-scraper.provider";
import { syncLiveClubStandings } from "@/lib/standings/live-sync";
import { verifyCronAuth } from "@/lib/cron-auth";

const LNH_SEASONS_ID_2026_2027 = "40";

export async function POST(req: Request) {
  if (!(await verifyCronAuth(req))) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Cron secret invalide" } }, { status: 401 });
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json(
      { error: { code: "NO_SEASON", message: "Aucune saison active" } },
      { status: 400 }
    );
  }

  // Journée en cours = dernière journée avec au moins un match terminé, 0 en
  // pré-saison (même convention que getDashboardMatchStrips::lastFinishedGameweek).
  const lastFinishedGameweek = await prisma.gameweek.findFirst({
    where: { seasonId: season.id, matches: { some: { status: "FINISHED" } } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const gameweekNumber = lastFinishedGameweek?.number ?? 0;

  try {
    const result = await syncLiveClubStandings(season.id, LNH_SEASONS_ID_2026_2027, gameweekNumber);
    return NextResponse.json({ data: { season: season.label, ...result } });
  } catch (err) {
    const recoverable = err instanceof IngestionError ? err.recoverable : false;
    console.error("[sync-standings]", err);
    return NextResponse.json(
      { error: { code: "SCRAPER_ERROR", message: String(err), recoverable } },
      { status: 502 }
    );
  }
}
