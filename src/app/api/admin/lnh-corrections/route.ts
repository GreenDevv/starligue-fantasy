export const dynamic = "force-dynamic";

// GET /api/admin/lnh-corrections?gameweek=N — ARCHITECTURE.md §4.3
// Re-scrape les boxscores lnh.fr de la journée N et les compare aux PlayerMatchStat
// enregistrés (lecture seule) : renvoie les corrections que la LNH a publiées a
// posteriori, groupées par match, à valider dans /admin/lnh-corrections.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { IngestionError } from "@/lib/data-providers/lnh-scraper.provider";
import { analyzeGameweekCorrections } from "@/lib/lnh-corrections/analyze";

async function requireAdmin() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") return null;
  return session;
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const gwParam = new URL(req.url).searchParams.get("gameweek");
  const gameweekNumber = gwParam ? parseInt(gwParam, 10) : NaN;
  if (!Number.isInteger(gameweekNumber) || gameweekNumber < 1) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Paramètre ?gameweek=N requis" } },
      { status: 400 }
    );
  }

  try {
    const data = await analyzeGameweekCorrections(gameweekNumber);
    return NextResponse.json({ data });
  } catch (e) {
    if (e instanceof IngestionError) {
      return NextResponse.json({ error: { code: "SCRAPER_ERROR", message: e.message } }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ error: { code: "ANALYZE_ERROR", message } }, { status: 400 });
  }
}
