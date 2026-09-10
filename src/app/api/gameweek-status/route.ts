export const dynamic = "force-dynamic";

// GET /api/gameweek-status → état de confiance de la journée "en cours" de la
// saison live (LIVE / AWAITING_RESULTS / PROVISIONAL / CONFIRMED), pour les
// surfaces client qui affichent un badge (classement…). null en pré-saison.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentGameweekStatus } from "@/lib/gameweek/get-gameweek-status";

export async function GET() {
  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) return NextResponse.json({ data: null });

  const status = await getCurrentGameweekStatus(season.id);
  if (!status) return NextResponse.json({ data: null });

  return NextResponse.json({
    data: {
      number: status.number,
      state: status.state,
      tone: status.tone,
      matchesFinished: status.matchesFinished,
      matchesTotal: status.matchesTotal,
      anyMatchLive: status.anyMatchLive,
      pointsMayChange: status.pointsMayChange,
      hasCorrection: status.hasCorrection,
      correctionAt: status.correctionAt?.toISOString() ?? null,
    },
  });
}
