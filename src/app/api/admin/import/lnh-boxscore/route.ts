// POST /api/admin/import/lnh-boxscore
// Scrape et upsert les stats détaillées de boxscore (buts, passes, ballons
// récupérés, etc. — src/lib/stats/stat-lines.ts) pour tous les matchs joués d'une
// journée de la saison en direct. Résout d'abord les lnh_calendars_id manquants
// (premier appel sur une saison) puis scrape le boxscore de chaque match.
// { gameweekId, lnhSeasonsId?, seasonStartYear? }
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { IngestionError } from "@/lib/data-providers/lnh-scraper.provider";
import { syncCalendarsIdsForSeason, syncGameweekBoxscore } from "@/lib/ingestion/boxscore";

async function requireAdmin() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") return null;
  return session;
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    gameweekId?: string;
    lnhSeasonsId?: string;
    seasonStartYear?: number;
  };
  if (!body.gameweekId) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "gameweekId requis" } },
      { status: 400 }
    );
  }
  const lnhSeasonsId = body.lnhSeasonsId ?? "40"; // 2026/2027 par défaut

  const gameweek = await prisma.gameweek.findUnique({
    where: { id: body.gameweekId },
    select: { seasonId: true },
  });
  if (!gameweek) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Journée introuvable" } }, { status: 404 });
  }

  try {
    const calendarsIdSync = await syncCalendarsIdsForSeason(
      gameweek.seasonId,
      lnhSeasonsId,
      body.seasonStartYear ?? 2026
    );
    const boxscoreSync = await syncGameweekBoxscore(body.gameweekId, lnhSeasonsId);
    return NextResponse.json({ data: { calendarsIdSync, boxscoreSync } });
  } catch (e) {
    if (e instanceof IngestionError) {
      return NextResponse.json({ error: { code: "SCRAPER_ERROR", message: e.message } }, { status: 502 });
    }
    throw e;
  }
}
