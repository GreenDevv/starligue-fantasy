// Résolution d'un tour d'enchères — ARCHITECTURE.md §18.3.
// Fonction PURE — aucun import Prisma.

export interface AuctionRoundBid {
  id: string;
  teamId: string;
  playerId: string;
  amount: number;
}

export interface AuctionRoundResolution {
  winners: Array<{ bidId: string; teamId: string; playerId: string; amount: number }>;
  losers: Array<{ bidId: string }>;
}

/**
 * Pour chaque joueur ayant reçu au moins une enchère : la plus haute
 * l'emporte. Égalité sur la plus haute enchère → personne ne remporte le
 * joueur ce tour (règle produit explicite, §18.3) — toutes les enchères sur
 * ce joueur repassent en "perdantes" et le joueur reste disponible au tour
 * suivant.
 */
export function resolveAuctionRound(bids: AuctionRoundBid[]): AuctionRoundResolution {
  const byPlayer = new Map<string, AuctionRoundBid[]>();
  for (const bid of bids) {
    const list = byPlayer.get(bid.playerId) ?? [];
    list.push(bid);
    byPlayer.set(bid.playerId, list);
  }

  const winners: AuctionRoundResolution["winners"] = [];
  const losers: AuctionRoundResolution["losers"] = [];

  for (const playerBids of byPlayer.values()) {
    const maxAmount = Math.max(...playerBids.map((b) => b.amount));
    const topBids = playerBids.filter((b) => b.amount === maxAmount);

    if (topBids.length === 1) {
      const winner = topBids[0]!;
      winners.push({ bidId: winner.id, teamId: winner.teamId, playerId: winner.playerId, amount: winner.amount });
      for (const b of playerBids) {
        if (b.id !== winner.id) losers.push({ bidId: b.id });
      }
    } else {
      for (const b of playerBids) losers.push({ bidId: b.id });
    }
  }

  return { winners, losers };
}
