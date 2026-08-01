export const dynamic = "force-dynamic";

// POST /api/cron/sync-coupe-de-france
// Scrape le calendrier "Coupe de France" (compétition officiellement labellisée
// ainsi par la LNH, même calendrier global que Warm Up — src/lib/data-providers/
// lnh-scraper.provider.ts::fetchCoupeDeFranceMatches) et upsert les rencontres
// impliquant au moins un club Daikin StarLigue (src/lib/ingestion/warmup.ts,
// syncCoupeDeFranceMatches). Calendrier ET résultats en une seule passe
// (current_month=all côté lnh.fr), même route jumelle que /api/cron/sync-warmup.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { IngestionError } from "@/lib/data-providers/lnh-scraper.provider";
import { syncCoupeDeFranceMatches } from "@/lib/ingestion/warmup";
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
    const result = await syncCoupeDeFranceMatches(season.id, LNH_SEASONS_ID_2026_2027, SEASON_START_YEAR_2026_2027);
    return NextResponse.json({ data: { season: season.label, ...result } });
  } catch (err) {
    const recoverable = err instanceof IngestionError ? err.recoverable : false;
    console.error("[sync-coupe-de-france]", err);
    return NextResponse.json(
      { error: { code: "SCRAPER_ERROR", message: String(err), recoverable } },
      { status: 502 }
    );
  }
}
