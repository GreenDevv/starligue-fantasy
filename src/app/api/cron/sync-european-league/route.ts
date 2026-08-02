export const dynamic = "force-dynamic";

// POST /api/cron/sync-european-league
// Récupère le calendrier EHF European League Men 2026/27 (API JSON umbraco,
// src/lib/data-providers/ehf-scraper.provider.ts::fetchEuropeanLeagueMatches) et
// upsert les rencontres impliquant au moins un club Daikin StarLigue
// (src/lib/ingestion/warmup.ts, syncEuropeanLeagueMatches). Calendrier ET résultats
// en une seule passe, même route jumelle que /api/cron/sync-champions-league — la
// page saison EHF European League 2026/27 n'existe pas encore au moment d'écrire ce
// code (404), la route renverra une erreur récupérable jusqu'à sa publication (voir
// commentaire de syncEuropeanLeagueMatches), sans configuration à changer une fois
// publiée.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { IngestionError } from "@/lib/data-providers/lnh-scraper.provider";
import { syncEuropeanLeagueMatches } from "@/lib/ingestion/warmup";
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
    const result = await syncEuropeanLeagueMatches(season.id);
    return NextResponse.json({ data: { season: season.label, ...result } });
  } catch (err) {
    const recoverable = err instanceof IngestionError ? err.recoverable : false;
    console.error("[sync-european-league]", err);
    return NextResponse.json(
      { error: { code: "SCRAPER_ERROR", message: String(err), recoverable } },
      { status: 502 }
    );
  }
}
