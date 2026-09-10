export const dynamic = "force-dynamic";

// POST /api/cron/lnh-corrections — ARCHITECTURE.md §4.3
// Détecte les corrections LNH a posteriori sur les dernières journées notées, les
// applique + rejoue le scoring, et prévient les admins par email des lots à
// relire. N'envoie AUCUN email manager (décision humaine, écran admin).
// ?gameweek=N pour forcer une journée précise, ?lookback=K pour le nombre de
// journées notées à re-vérifier (défaut 2).
import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { IngestionError } from "@/lib/data-providers/lnh-scraper.provider";
import { runWeeklyCorrectionsCheck } from "@/lib/lnh-corrections/cron";

export async function POST(req: Request) {
  if (!(await verifyCronAuth(req))) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Cron secret invalide" } }, { status: 401 });
  }

  const url = new URL(req.url);
  const gwParam = url.searchParams.get("gameweek");
  const lookbackParam = url.searchParams.get("lookback");

  try {
    const data = await runWeeklyCorrectionsCheck({
      gameweekNumbers: gwParam ? [parseInt(gwParam, 10)] : undefined,
      lookback: lookbackParam ? parseInt(lookbackParam, 10) : undefined,
    });
    return NextResponse.json({ data });
  } catch (e) {
    if (e instanceof IngestionError) {
      return NextResponse.json(
        { error: { code: "SCRAPER_ERROR", message: e.message }, recoverable: true },
        { status: 502 }
      );
    }
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ error: { code: "CRON_ERROR", message } }, { status: 500 });
  }
}
