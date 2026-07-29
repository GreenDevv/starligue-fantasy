// Validation des enchères d'un tour — ARCHITECTURE.md §18.2.
// Fonctions PURES — aucun import Prisma.
import { POSITIONS, type Position } from "@/lib/squad/validation";

export interface AuctionBidInput {
  playerId: string;
  amount: number;
}

export interface AuctionPlayerInfo {
  position: Position;
  clubId: string;
}

export interface AuctionValidationContext {
  budget: number; // budget restant de l'équipe
  playersById: Map<string, AuctionPlayerInfo>;
  squadPositionCounts: Partial<Record<Position, number>>; // joueurs déjà remportés, par poste
  squadClubCounts: Record<string, number>; // joueurs déjà remportés, par club
  playersPerPosition?: number; // défaut 2
  maxPlayersPerClub?: number; // défaut 3
}

export type AuctionBidError =
  | { code: "UNKNOWN_PLAYER"; playerId: string }
  | { code: "INVALID_AMOUNT"; playerId: string }
  | { code: "DUPLICATE_BID"; playerId: string }
  | { code: "BUDGET_EXCEEDED"; budget: number; total: number; overage: number }
  | { code: "POSITION_FULL"; position: Position; remaining: number; requested: number }
  | { code: "TOO_MANY_PLAYERS_FROM_CLUB"; clubId: string; count: number; max: number };

export interface AuctionValidationResult {
  valid: boolean;
  errors: AuctionBidError[];
}

/**
 * Valide les enchères qu'une équipe s'apprête à soumettre pour le tour
 * courant : budget, une enchère max par joueur, pas plus d'enchères sur un
 * poste que de slots restants, pas plus qu'un club déjà à
 * `maxPlayersPerClub` en tenant compte des enchères en cours (§18.2).
 */
export function validateAuctionBids(
  bids: AuctionBidInput[],
  context: AuctionValidationContext
): AuctionValidationResult {
  const errors: AuctionBidError[] = [];
  const playersPerPosition = context.playersPerPosition ?? 2;
  const maxPlayersPerClub = context.maxPlayersPerClub ?? 3;

  const seen = new Set<string>();
  for (const bid of bids) {
    if (seen.has(bid.playerId)) {
      errors.push({ code: "DUPLICATE_BID", playerId: bid.playerId });
    }
    seen.add(bid.playerId);

    if (!(bid.amount > 0)) {
      errors.push({ code: "INVALID_AMOUNT", playerId: bid.playerId });
    }

    if (!context.playersById.has(bid.playerId)) {
      errors.push({ code: "UNKNOWN_PLAYER", playerId: bid.playerId });
    }
  }

  const total = bids.reduce((s, b) => s + b.amount, 0);
  const totalRounded = Math.round(total * 10) / 10;
  if (totalRounded > context.budget) {
    errors.push({
      code: "BUDGET_EXCEEDED",
      budget: context.budget,
      total: totalRounded,
      overage: Math.round((totalRounded - context.budget) * 10) / 10,
    });
  }

  const bidCountByPosition = new Map<Position, number>();
  const bidCountByClub = new Map<string, number>();
  for (const bid of bids) {
    const info = context.playersById.get(bid.playerId);
    if (!info) continue; // déjà signalé (UNKNOWN_PLAYER)
    bidCountByPosition.set(info.position, (bidCountByPosition.get(info.position) ?? 0) + 1);
    bidCountByClub.set(info.clubId, (bidCountByClub.get(info.clubId) ?? 0) + 1);
  }

  for (const pos of POSITIONS) {
    const requested = bidCountByPosition.get(pos) ?? 0;
    if (requested === 0) continue;
    const remaining = playersPerPosition - (context.squadPositionCounts[pos] ?? 0);
    if (requested > remaining) {
      errors.push({ code: "POSITION_FULL", position: pos, remaining, requested });
    }
  }

  for (const [clubId, requested] of bidCountByClub) {
    const existing = context.squadClubCounts[clubId] ?? 0;
    const count = existing + requested;
    if (count > maxPlayersPerClub) {
      errors.push({ code: "TOO_MANY_PLAYERS_FROM_CLUB", clubId, count, max: maxPlayersPerClub });
    }
  }

  return { valid: errors.length === 0, errors };
}
