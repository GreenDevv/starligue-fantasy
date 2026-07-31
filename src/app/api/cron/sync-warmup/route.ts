export const dynamic = "force-dynamic";

// POST /api/cron/sync-warmup
// Scrape le calendrier "Warm Up" (matchs de préparation, compétition officiellement
// labellisée ainsi par la LNH — src/lib/data-providers/lnh-scraper.provider.ts::
// fetchWarmupMatches) et upsert les rencontres impliquant au moins un club Daikin
// StarLigue (src/lib/ingestion/warmup.ts). Calendrier ET résultats en une seule
// passe (current_month=all côté lnh.fr) — pas besoin de paramètre de journée, il n'y
// a pas de journée ici.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { IngestionError } from "@/lib/data-providers/lnh-scraper.provider";
import { syncWarmupMatches } from "@/lib/ingestion/warmup";
import { verifyCronAuth } from "@/lib/cron-auth";

const LNH_SEASONS_ID_2026_2027 = "40";
const SEASON_START_YEAR_2026_2027 = 2026;

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

  try {
    const result = await syncWarmupMatches(season.id, LNH_SEASONS_ID_2026_2027, SEASON_START_YEAR_2026_2027);
    return NextResponse.json({ data: { season: season.label, ...result } });
  } catch (err) {
    const recoverable = err instanceof IngestionError ? err.recoverable : false;
    console.error("[sync-warmup]", err);
    return NextResponse.json(
      { error: { code: "SCRAPER_ERROR", message: String(err), recoverable } },
      { status: 502 }
    );
  }
}
