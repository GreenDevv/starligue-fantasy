export const dynamic = "force-dynamic";

// POST /api/leagues/:id/auction/submit — soumet mon tour, déclenche la résolution
// si je suis le dernier membre attendu (§18.2, §18.6)
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOrCreateCurrentRound, maybeResolveRound } from "@/lib/auction/round-service";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  const userId = session.user.id;
  const leagueId = params.id;

  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { mode: true } });
  if (!league || league.mode !== "AUCTION") {
    return NextResponse.json({ error: { code: "NOT_AUCTION_LEAGUE" } }, { status: 400 });
  }

  const team = await prisma.fantasyTeam.findUnique({ where: { userId_leagueId: { userId, leagueId } } });
  if (!team) {
    return NextResponse.json({ error: { code: "NOT_A_MEMBER" } }, { status: 403 });
  }

  const { round, finished } = await getOrCreateCurrentRound(leagueId);
  if (finished || round.status !== "OPEN") {
    return NextResponse.json({ error: { code: "ROUND_NOT_OPEN", message: "Aucun tour ouvert" } }, { status: 400 });
  }

  try {
    await prisma.auctionRoundSubmission.create({
      data: { auctionRoundId: round.id, fantasyTeamId: team.id },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: { code: "ALREADY_SUBMITTED" } }, { status: 400 });
    }
    throw e;
  }

  const result = await maybeResolveRound(round.id, leagueId);
  return NextResponse.json({ data: result });
}
