export const dynamic = "force-dynamic";

// POST /api/cron/sync-champions-league
// Récupère le calendrier EHF Champions League Men 2026/27 (API JSON umbraco,
// src/lib/data-providers/ehf-scraper.provider.ts::fetchChampionsLeagueMatches) et
// upsert les rencontres impliquant au moins un club Daikin StarLigue
// (src/lib/ingestion/warmup.ts, syncChampionsLeagueMatches). Calendrier ET
// résultats en une seule passe, même route jumelle que /api/cron/sync-warmup et
// /api/cron/sync-coupe-de-france.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { IngestionError } from "@/lib/data-providers/lnh-scraper.provider";
import { syncChampionsLeagueMatches } from "@/lib/ingestion/warmup";
import { verifyCronAuth } from "@/lib/cron-auth";

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
    const result = await syncChampionsLeagueMatches(season.id);
    return NextResponse.json({ data: { season: season.label, ...result } });
  } catch (err) {
    const recoverable = err instanceof IngestionError ? err.recoverable : false;
    console.error("[sync-champions-league]", err);
    return NextResponse.json(
      { error: { code: "SCRAPER_ERROR", message: String(err), recoverable } },
      { status: 502 }
    );
  }
}
