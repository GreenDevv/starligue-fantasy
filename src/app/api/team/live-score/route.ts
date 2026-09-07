export const dynamic = "force-dynamic";

// GET /api/team/live-score — score PROVISOIRE de la journée en cours pour l'équipe
// active de l'utilisateur (« Centre live », Lot 3). 204 s'il n'y a rien à montrer.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveSeasonMode, resolveActiveTeamContext } from "@/lib/team/active-team-context";
import { getLiveGameweekScore } from "@/lib/team/live-gameweek-score";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse(null, { status: 401 });

  const leagueId = new URL(request.url).searchParams.get("leagueId") ?? undefined;
  const mode = resolveSeasonMode();
  const ctx = await resolveActiveTeamContext(session.user.id, mode, leagueId ?? undefined);
  if (!ctx) return new NextResponse(null, { status: 204 });

  const score = await getLiveGameweekScore(mode, ctx.teamId);
  if (!score) return new NextResponse(null, { status: 204 });

  return NextResponse.json({ data: score });
}
