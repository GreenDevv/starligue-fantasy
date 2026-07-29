export const dynamic = "force-dynamic";

// POST /api/leagues/:id/auction/bids — remplace mes enchères du tour courant (§18.6)
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { type Position } from "@/lib/squad/validation";
import { validateAuctionBids, type AuctionPlayerInfo } from "@/lib/auction/validate";
import { getOrCreateCurrentRound } from "@/lib/auction/round-service";

const bodySchema = z.object({
  bids: z.array(z.object({ playerId: z.string(), amount: z.number().positive() })).max(14),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  const userId = session.user.id;
  const leagueId = params.id;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: parsed.error.message } },
      { status: 400 }
    );
  }

  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { mode: true, seasonId: true } });
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

  const existingSubmission = await prisma.auctionRoundSubmission.findUnique({
    where: { auctionRoundId_fantasyTeamId: { auctionRoundId: round.id, fantasyTeamId: team.id } },
  });
  if (existingSubmission) {
    return NextResponse.json(
      { error: { code: "ALREADY_SUBMITTED", message: "Tour déjà soumis, enchères verrouillées" } },
      { status: 400 }
    );
  }

  const { bids } = parsed.data;
  const playerIds = bids.map((b) => b.playerId);

  const [players, mySquad, leagueOwned, maxPerClubConfig] = await Promise.all([
    prisma.player.findMany({ where: { id: { in: playerIds }, seasonId: league.seasonId } }),
    prisma.fantasySquadPlayer.findMany({
      where: { fantasyTeamId: team.id },
      include: { player: { select: { position: true, clubId: true } } },
    }),
    playerIds.length > 0
      ? prisma.fantasySquadPlayer.findMany({
          where: { fantasyTeam: { leagueId }, playerId: { in: playerIds } },
          select: { playerId: true },
        })
      : Promise.resolve([]),
    prisma.gameConfig.findUnique({ where: { key: "MAX_PLAYERS_PER_CLUB" } }),
  ]);

  if (leagueOwned.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: "PLAYER_ALREADY_OWNED",
          message: "Un ou plusieurs joueurs sont déjà remportés par une autre équipe de la ligue",
          details: leagueOwned.map((o) => o.playerId),
        },
      },
      { status: 422 }
    );
  }

  const playersById = new Map<string, AuctionPlayerInfo>(
    players.map((p) => [p.id, { position: p.position as Position, clubId: p.clubId }])
  );

  const squadPositionCounts: Partial<Record<Position, number>> = {};
  const squadClubCounts: Record<string, number> = {};
  for (const entry of mySquad) {
    const pos = entry.player.position as Position;
    squadPositionCounts[pos] = (squadPositionCounts[pos] ?? 0) + 1;
    squadClubCounts[entry.player.clubId] = (squadClubCounts[entry.player.clubId] ?? 0) + 1;
  }

  const maxPlayersPerClub = maxPerClubConfig ? parseInt(maxPerClubConfig.value, 10) : 3;

  const { valid, errors } = validateAuctionBids(bids, {
    budget: Number(team.budget),
    playersById,
    squadPositionCounts,
    squadClubCounts,
    maxPlayersPerClub,
  });

  if (!valid) {
    return NextResponse.json(
      { error: { code: "BIDS_INVALID", message: "Enchères invalides", details: errors } },
      { status: 422 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.auctionBid.deleteMany({ where: { auctionRoundId: round.id, fantasyTeamId: team.id } });
    if (bids.length > 0) {
      await tx.auctionBid.createMany({
        data: bids.map((b) => ({
          auctionRoundId: round.id,
          fantasyTeamId: team.id,
          playerId: b.playerId,
          amount: b.amount,
        })),
      });
    }
  });

  return NextResponse.json({ data: { success: true } });
}
