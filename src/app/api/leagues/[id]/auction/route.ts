export const dynamic = "force-dynamic";

// GET /api/leagues/:id/auction — état du tour courant (§18.6 ARCHITECTURE.md)
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POSITIONS, type Position } from "@/lib/squad/validation";
import { getOrCreateCurrentRound } from "@/lib/auction/round-service";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  const userId = session.user.id;
  const leagueId = params.id;

  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { mode: true } });
  if (!league) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Ligue introuvable" } }, { status: 404 });
  }
  if (league.mode !== "AUCTION") {
    return NextResponse.json(
      { error: { code: "NOT_AUCTION_LEAGUE", message: "Cette ligue n'est pas en mode Enchères" } },
      { status: 400 }
    );
  }

  const team = await prisma.fantasyTeam.findUnique({ where: { userId_leagueId: { userId, leagueId } } });
  if (!team) {
    return NextResponse.json({ error: { code: "NOT_A_MEMBER", message: "Pas membre de cette ligue" } }, { status: 403 });
  }

  const { round, finished, roundCount } = await getOrCreateCurrentRound(leagueId);

  const [mySquad, myBids, mySubmission, submittedCount, memberCount, leagueOwned, initialBudgetConfig, maxPerClubConfig] =
    await Promise.all([
      prisma.fantasySquadPlayer.findMany({
        where: { fantasyTeamId: team.id },
        include: { player: { select: { position: true, clubId: true } } },
      }),
      prisma.auctionBid.findMany({ where: { auctionRoundId: round.id, fantasyTeamId: team.id } }),
      prisma.auctionRoundSubmission.findUnique({
        where: { auctionRoundId_fantasyTeamId: { auctionRoundId: round.id, fantasyTeamId: team.id } },
      }),
      prisma.auctionRoundSubmission.count({ where: { auctionRoundId: round.id } }),
      prisma.leagueMember.count({ where: { leagueId } }),
      prisma.fantasySquadPlayer.findMany({ where: { fantasyTeam: { leagueId } }, select: { playerId: true } }),
      prisma.gameConfig.findUnique({ where: { key: "AUCTION_INITIAL_BUDGET" } }),
      prisma.gameConfig.findUnique({ where: { key: "MAX_PLAYERS_PER_CLUB" } }),
    ]);
  const initialBudget = parseFloat(initialBudgetConfig?.value ?? "500.0");
  const maxPlayersPerClub = maxPerClubConfig ? parseInt(maxPerClubConfig.value, 10) : 3;

  const squadPositionCounts: Partial<Record<Position, number>> = {};
  for (const pos of POSITIONS) squadPositionCounts[pos] = 0;
  const squadClubCounts: Record<string, number> = {};
  for (const entry of mySquad) {
    const pos = entry.player.position as Position;
    squadPositionCounts[pos] = (squadPositionCounts[pos] ?? 0) + 1;
    squadClubCounts[entry.player.clubId] = (squadClubCounts[entry.player.clubId] ?? 0) + 1;
  }

  return NextResponse.json({
    data: {
      roundNumber: round.roundNumber,
      roundStatus: round.status,
      roundCount,
      auctionFinished: finished,
      budget: Number(team.budget),
      initialBudget,
      squadSize: mySquad.length,
      squadPositionCounts,
      squadClubCounts,
      maxPlayersPerClub,
      isValidated: team.isValidated,
      myBids: myBids.map((b) => ({ playerId: b.playerId, amount: Number(b.amount) })),
      submitted: Boolean(mySubmission),
      submittedCount,
      memberCount,
      unavailablePlayerIds: leagueOwned.map((s) => s.playerId),
    },
  });
}
