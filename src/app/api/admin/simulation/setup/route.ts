// POST /api/admin/simulation/setup — importe une saison historique complète (clubs,
// calendrier, joueurs, valorisation d'après la saison précédente) pour le Mode
// Simulation. Idempotent — rejouable sans doublon.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setupSimulationSeason } from "@/lib/simulation/setup";
import { IngestionError } from "@/lib/data-providers/lnh-scraper.provider";

export async function POST(req: Request) {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as {
    seasonLabel?: string;
    lnhSeasonsId?: string;
    seasonStartYear?: number;
    priorLnhSeasonsId?: string;
    priorSeasonLabel?: string;
  };

  try {
    const result = await setupSimulationSeason({
      seasonLabel: body.seasonLabel ?? "2025-2026",
      lnhSeasonsId: body.lnhSeasonsId ?? "39",
      seasonStartYear: body.seasonStartYear ?? 2025,
      priorLnhSeasonsId: body.priorLnhSeasonsId ?? "37",
      priorSeasonLabel: body.priorSeasonLabel ?? "2024/2025",
    });
    return NextResponse.json({ data: result });
  } catch (e) {
    if (e instanceof IngestionError) {
      return NextResponse.json({ error: { code: "SCRAPER_ERROR", message: e.message } }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ error: { code: "SETUP_ERROR", message } }, { status: 500 });
  }
}
