export const dynamic = "force-dynamic";

// GET /api/leaderboard/team/:teamId/gameweek/:gameweekId — détail joueur par
// joueur d'une journée déjà notée pour une équipe (LIVE) — "descendre au niveau
// joueur" du classement général/de ligue, voir /leaderboard/team/[teamId].
import { NextResponse } from "next/server";
import { getFantasyLineupPlayerBreakdown } from "@/lib/leaderboard/team-breakdown";

export async function GET(
  _req: Request,
  { params }: { params: { teamId: string; gameweekId: string } }
) {
  const players = await getFantasyLineupPlayerBreakdown(params.teamId, params.gameweekId);
  if (players === null) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Journée introuvable ou pas encore notée" } },
      { status: 404 }
    );
  }
  return NextResponse.json({ data: { players } });
}
