export const dynamic = "force-dynamic";
export const maxDuration = 600;

// POST /api/cron/lfh-roster-sync — jeu LBE seulement (ARCHITECTURE.md §35.4.1).
// Effectif de la poule (fiches LFH + saisies manuelles lfh-roster-overrides.ts) →
// si nouvelles joueuses : stats rejouées sur les journées passées (leurs matchs
// déjà joués) → valeur des SEULES nouvelles (valuationPending), les autres gardent
// la leur. Rejouable, quasi gratuit quand rien ne change.
// Planifié par .github/workflows/cron-lbe.yml (quotidien).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getCompetitionProfile } from "@/lib/competition/profile";
import { syncLfhRoster, valueLfhPendingPlayers } from "@/lib/ingestion/lfh";
import { refreshLfhSeasonStats } from "@/lib/ingestion/lfh-launch";

export async function POST(req: Request) {
  if (!(await verifyCronAuth(req))) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Cron secret invalide" } }, { status: 401 });
  }
  if (getCompetitionProfile().id !== "LFH") {
    return NextResponse.json({ data: { skipped: true, reason: "lfh-roster-sync : réservé au jeu LBE" } });
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ error: { code: "NO_SEASON", message: "Aucune saison active" } }, { status: 400 });
  }

  try {
    const roster = await syncLfhRoster(season.id);
    const stats = roster.created > 0 ? await refreshLfhSeasonStats(season.id) : null;
    const valued = await valueLfhPendingPlayers(season.id);
    return NextResponse.json({ data: { season: season.label, roster, statsRefreshed: stats !== null, valued } });
  } catch (err) {
    console.error("[lfh-roster-sync]", err);
    return NextResponse.json({ error: { code: "SYNC_FAILED", message: String(err) } }, { status: 502 });
  }
}
