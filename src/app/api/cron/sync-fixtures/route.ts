// POST /api/cron/sync-fixtures
// Sync le calendrier et les résultats depuis API-Sports.
// Paramètre ?season=YYYY (défaut : saison active).
// Protégé par CRON_SECRET (Authorization: Bearer <secret>).
// ARCHITECTURE.md §4.1 : cron "sync-fixtures" — 1×/jour 06:00

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createApiSportsProvider } from "@/lib/data-providers/api-sports.provider";
import { syncFixtures } from "@/lib/ingestion/sync";
import { verifyCronAuth } from "@/lib/cron-auth";

export async function POST(req: Request) {
  if (!(await verifyCronAuth(req))) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Cron secret invalide" } }, { status: 401 });
  }

  const url = new URL(req.url);
  const seasonParam = url.searchParams.get("season");

  // Résoudre la saison cible
  const season = seasonParam
    ? await prisma.season.findFirst({ where: { label: { contains: seasonParam } } })
    : await prisma.season.findFirst({ where: { isActive: true } });

  if (!season) {
    return NextResponse.json(
      { error: { code: "NO_SEASON", message: seasonParam ? `Saison '${seasonParam}' introuvable` : "Aucune saison active" } },
      { status: 400 }
    );
  }

  const provider = createApiSportsProvider();
  if (!provider) {
    return NextResponse.json(
      { error: { code: "NO_PROVIDER", message: "API_SPORTS_KEY non configurée" } },
      { status: 503 }
    );
  }

  // Extraire l'année de début de la saison (ex: "2026-2027" → "2026")
  const apiSportsSeason = seasonParam ?? season.label.split("-")[0]!;

  try {
    const fixtures = await provider.fetchFixtures(apiSportsSeason);
    const syncResult = await syncFixtures(fixtures, season.id, "api_sports");

    return NextResponse.json({
      data: {
        season: season.label,
        apiSportsSeason,
        provider: provider.name,
        fixtures: fixtures.length,
        ...syncResult,
      },
    });
  } catch (err) {
    console.error("[sync-fixtures]", err);
    return NextResponse.json(
      { error: { code: "SYNC_ERROR", message: String(err) } },
      { status: 500 }
    );
  }
}
