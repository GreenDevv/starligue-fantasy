export const dynamic = "force-dynamic";

// POST /api/cron/compute-scores — ARCHITECTURE.md §6.7
// Déclenche computeGameweekScores pour toutes les journées snapshotées non scorées.
// Rejouable : computeGameweekScores efface et recalcule.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeGameweekScores } from "@/lib/scoring/compute";
import { verifyCronAuth } from "@/lib/cron-auth";
import { generateWeeklyNews } from "@/lib/news/generate-weekly-news";

interface JobResult {
  gameweekId: string;
  number: number;
  success?: boolean;
  lineupCount?: number;
  skipped?: boolean;
  reason?: string;
}

export async function POST(request: Request) {
  if (!(await verifyCronAuth(request))) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  // Journées avec au moins un snapshot, non encore scorées
  const candidates = await prisma.gameweek.findMany({
    where: { isScored: false, season: { isActive: true }, lineups: { some: {} } },
    orderBy: { number: "asc" },
  });

  const results: JobResult[] = [];

  for (const gameweek of candidates) {
    try {
      const { lineupCount } = await computeGameweekScores(gameweek.id);
      results.push({ gameweekId: gameweek.id, number: gameweek.number, success: true, lineupCount });

      // Actus générées (équipe type + meilleures perfs de la journée) pour /starligue —
      // encapsulé pour qu'un échec de génération ne transforme jamais un scoring
      // réussi en résultat "skipped" (le calcul des points reste la priorité).
      try {
        await generateWeeklyNews(gameweek.seasonId, gameweek.id, gameweek.number);
      } catch (newsError) {
        console.error("[compute-scores][weekly-news]", newsError);
      }
    } catch (e) {
      results.push({
        gameweekId: gameweek.id,
        number: gameweek.number,
        skipped: true,
        reason: e instanceof Error ? e.message : "erreur inconnue",
      });
    }
  }

  return NextResponse.json({ data: results });
}