export const dynamic = "force-dynamic";

// POST /api/cron/sync-results
// Met à jour les scores des matchs terminés depuis API-Sports.
// Même source que sync-fixtures : fetchFixtures retourne fixtures + scores.
// ARCHITECTURE.md §4.1 : cron soirs de journée (J, V, S, D 20h–02h)

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

  const apiSportsSeason = seasonParam ?? season.label.split("-")[0]!;

  try {
    // Récupère toutes les fixtures (inclut les scores des matchs terminés)
    const fixtures = await provider.fetchFixtures(apiSportsSeason);

    // Ne synchronise que les matchs terminés ou en cours pour économiser les écritures
    const finished = fixtures.filter((f) =>
      f.status === "FINISHED" || f.status === "LIVE"
    );

    const syncResult = await syncFixtures(finished, season.id, "api_sports");

    // Décompte : combien ont un score mis à jour
    const withScores = finished.filter(
      (f) => f.homeScore !== null && f.awayScore !== null
    ).length;

    return NextResponse.json({
      data: {
        season: season.label,
        provider: provider.name,
        checked: finished.length,
        withScores,
        ...syncResult,
      },
    });
  } catch (err) {
    console.error("[sync-results]", err);
    return NextResponse.json(
      { error: { code: "SYNC_ERROR", message: String(err) } },
      { status: 500 }
    );
  }
}