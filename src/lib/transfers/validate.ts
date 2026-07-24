// Validation d'un transfert (vente + achat simultanés, même poste) — fonction
// PURE, aucun import Prisma. Suit le pattern de src/lib/squad/validation.ts.

import type { Position, SquadPlayer } from "@/lib/squad/validation";

export interface TransferBuyPlayer {
  id: string;
  position: Position;
  marketValue: number;
  isActive: boolean;
}

export interface TransferInput {
  squad: SquadPlayer[]; // effectif courant (14 joueurs)
  sellPlayerId: string;
  buyPlayer: TransferBuyPlayer;
  budget: number; // budget restant courant de l'équipe
}

export type TransferError =
  | { code: "PLAYER_NOT_IN_SQUAD"; playerId: string }
  | { code: "PLAYER_ALREADY_IN_SQUAD"; playerId: string }
  | { code: "POSITION_MISMATCH"; sellPosition: Position; buyPosition: Position }
  | { code: "INACTIVE_PLAYER"; playerId: string }
  | { code: "BUDGET_EXCEEDED"; budget: number; shortfall: number };

export interface TransferValidationResult {
  valid: boolean;
  errors: TransferError[];
  newBudget: number;
}

/**
 * Valide un échange 1-pour-1 au même poste. Vente créditée à la valeur marchande
 * courante du joueur vendu, achat débité à la valeur marchande courante du joueur
 * acheté — pas de prix d'achat historique.
 */
export function validateTransfer(input: TransferInput): TransferValidationResult {
  const { squad, sellPlayerId, buyPlayer, budget } = input;
  const errors: TransferError[] = [];

  const sellPlayer = squad.find((p) => p.id === sellPlayerId);
  if (!sellPlayer) {
    errors.push({ code: "PLAYER_NOT_IN_SQUAD", playerId: sellPlayerId });
  }

  if (squad.some((p) => p.id === buyPlayer.id)) {
    errors.push({ code: "PLAYER_ALREADY_IN_SQUAD", playerId: buyPlayer.id });
  }

  if (sellPlayer && sellPlayer.position !== buyPlayer.position) {
    errors.push({
      code: "POSITION_MISMATCH",
      sellPosition: sellPlayer.position,
      buyPosition: buyPlayer.position,
    });
  }

  if (!buyPlayer.isActive) {
    errors.push({ code: "INACTIVE_PLAYER", playerId: buyPlayer.id });
  }

  const newBudget = sellPlayer ? budget + sellPlayer.marketValue - buyPlayer.marketValue : budget;
  if (newBudget < 0) {
    errors.push({ code: "BUDGET_EXCEEDED", budget, shortfall: Math.round(-newBudget * 10) / 10 });
  }

  return { valid: errors.length === 0, errors, newBudget: Math.round(newBudget * 10) / 10 };
}
