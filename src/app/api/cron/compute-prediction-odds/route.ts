// POST /api/cron/compute-prediction-odds — ARCHITECTURE.md §14, §6.7
// Crée les marchés de pronostic (cotes) pour les matchs programmés de la saison live
// qui n'en ont pas encore. Idempotent (voir ensurePredictionMarkets) : peut tourner
// aussi souvent que sync-fixtures sans jamais recalculer une cote déjà figée.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensurePredictionMarkets } from "@/lib/predictions/compute-odds";
import { verifyCronAuth } from "@/lib/cron-auth";

export async function POST(request: Request) {
  if (!(await verifyCronAuth(request))) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Cron secret invalide" } }, { status: 401 });
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json(
      { error: { code: "NO_SEASON", message: "Aucune saison active" } },
      { status: 400 }
    );
  }

  const result = await ensurePredictionMarkets(season.id);
  return NextResponse.json({ data: { season: season.label, ...result } });
}
