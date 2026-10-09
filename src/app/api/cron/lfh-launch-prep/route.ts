export const dynamic = "force-dynamic";
export const maxDuration = 600;

// POST /api/cron/lfh-launch-prep — jour J du jeu LBE (ARCHITECTURE.md §35.4.1).
// Équivaut à `scripts/setup-lfh-season.ts stats valuation` : calendrier LFH, stats +
// note de chaque journée jouée, classement, journées d'avant-lancement closes, puis
// valeurs de départ. Refus (409) dès qu'une équipe existe. Jeu LBE seulement.
// Appelé par .github/workflows/lbe-launch.yml.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getCompetitionProfile } from "@/lib/competition/profile";
import { runLfhLaunchPrep, LfhLaunchPrepRefused } from "@/lib/ingestion/lfh-launch";

export async function POST(req: Request) {
  if (!(await verifyCronAuth(req))) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Cron secret invalide" } }, { status: 401 });
  }
  if (getCompetitionProfile().id !== "LFH") {
    return NextResponse.json({ data: { skipped: true, reason: "lfh-launch-prep : réservé au jeu LBE" } });
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ error: { code: "NO_SEASON", message: "Aucune saison active" } }, { status: 400 });
  }

  try {
    const result = await runLfhLaunchPrep(season.id);
    return NextResponse.json({ data: { season: season.label, ...result } });
  } catch (err) {
    if (err instanceof LfhLaunchPrepRefused) {
      return NextResponse.json({ error: { code: "TEAMS_EXIST", message: err.message } }, { status: 409 });
    }
    console.error("[lfh-launch-prep]", err);
    return NextResponse.json({ error: { code: "PREP_FAILED", message: String(err) } }, { status: 502 });
  }
}
