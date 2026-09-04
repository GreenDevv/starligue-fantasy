// Orchestration des tours d'enchères (création/résolution) — exception
// délibérée à la règle "src/lib/** = fonctions pures" (même esprit que
// src/lib/transfers/status.ts) : la logique d'arbitrage pure vit dans
// resolve.ts, ce fichier ne fait que l'entourer de lectures/écritures Prisma
// partagées entre la route de soumission et le fallback admin (§18.2, §18.6).
import { prisma } from "@/lib/db";
import { resolveAuctionRound, type AuctionRoundBid } from "./resolve";

export async function getOrCreateCurrentRound(leagueId: string) {
  const roundCountConfig = await prisma.gameConfig.findUnique({ where: { key: "AUCTION_ROUND_COUNT" } });
  const roundCount = roundCountConfig ? parseInt(roundCountConfig.value, 10) : 3;

  const latest = await prisma.auctionRound.findFirst({
    where: { leagueId },
    orderBy: { roundNumber: "desc" },
  });

  if (!latest) {
    const created = await prisma.auctionRound.create({ data: { leagueId, roundNumber: 1 } });
    return { round: created, finished: false, roundCount };
  }

  if (latest.status === "OPEN") {
    return { round: latest, finished: false, roundCount };
  }

  if (latest.roundNumber >= roundCount) {
    return { round: latest, finished: true, roundCount };
  }

  const next = await prisma.auctionRound.create({
    data: { leagueId, roundNumber: latest.roundNumber + 1 },
  });
  return { round: next, finished: false, roundCount };
}

// Résolution effective d'un tour : arbitrage pur (resolveAuctionRound) puis
// écriture des gains (FantasySquadPlayer + budget) en transaction. Réutilisée
// par la résolution automatique (dernière soumission attendue) et par le
// fallback admin force-resolve.
export async function resolveRoundNow(roundId: string): Promise<void> {
  const bids = await prisma.auctionBid.findMany({ where: { auctionRoundId: roundId } });
  const roundBids: AuctionRoundBid[] = bids.map((b) => ({
    id: b.id,
    teamId: b.fantasyTeamId,
    playerId: b.playerId,
    amount: Number(b.amount),
  }));
  const { winners } = resolveAuctionRound(roundBids);

  await prisma.$transaction(async (tx) => {
    if (winners.length > 0) {
      await tx.auctionBid.updateMany({
        where: { id: { in: winners.map((w) => w.bidId) } },
        data: { won: true },
      });

      for (const w of winners) {
        await tx.fantasySquadPlayer.create({
          data: { fantasyTeamId: w.teamId, playerId: w.playerId, purchasePrice: w.amount },
        });
        await tx.fantasyTeam.update({
          where: { id: w.teamId },
          data: { budget: { decrement: w.amount } },
        });
      }

      const affectedTeamIds = [...new Set(winners.map((w) => w.teamId))];
      for (const teamId of affectedTeamIds) {
        const count = await tx.fantasySquadPlayer.count({ where: { fantasyTeamId: teamId } });
        if (count === 14) {
          await tx.fantasyTeam.update({ where: { id: teamId }, data: { isValidated: true, validatedAt: new Date(), captainId: null } });
        }
      }
    }

    await tx.auctionRound.update({ where: { id: roundId }, data: { status: "RESOLVED", resolvedAt: new Date() } });
  });
}

export interface RoundResolutionCheck {
  resolved: boolean;
  submittedCount: number;
  memberCount: number;
}

// Déclenche la résolution dès que toutes les FantasyTeam de la ligue ont
// soumis leur tour (§18.2) — no-op si des membres manquent encore.
export async function maybeResolveRound(roundId: string, leagueId: string): Promise<RoundResolutionCheck> {
  const [submittedCount, memberCount] = await Promise.all([
    prisma.auctionRoundSubmission.count({ where: { auctionRoundId: roundId } }),
    prisma.leagueMember.count({ where: { leagueId } }),
  ]);

  if (submittedCount < memberCount) {
    return { resolved: false, submittedCount, memberCount };
  }

  await resolveRoundNow(roundId);
  return { resolved: true, submittedCount, memberCount };
}
