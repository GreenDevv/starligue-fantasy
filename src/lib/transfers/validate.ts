// Validation d'un transfert (vente + achat simultanés, même poste) — fonction
// PURE, aucun import Prisma. Suit le pattern de src/lib/squad/validation.ts.

import { DEFAULT_SQUAD_CONFIG, type Position, type SquadPlayer } from "@/lib/squad/validation";

export interface TransferBuyPlayer {
  id: string;
  position: Position;
  marketValue: number;
  isActive: boolean;
  clubId: string;
}

export interface TransferInput {
  squad: SquadPlayer[]; // effectif courant (14 joueurs)
  sellPlayerId: string;
  buyPlayer: TransferBuyPlayer;
  budget: number; // budget restant courant de l'équipe
  maxPlayersPerClub?: number; // défaut DEFAULT_SQUAD_CONFIG.maxPlayersPerClub (3)
}

export type TransferError =
  | { code: "PLAYER_NOT_IN_SQUAD"; playerId: string }
  | { code: "PLAYER_ALREADY_IN_SQUAD"; playerId: string }
  | { code: "POSITION_MISMATCH"; sellPosition: Position; buyPosition: Position }
  | { code: "INACTIVE_PLAYER"; playerId: string }
  | { code: "TOO_MANY_PLAYERS_FROM_CLUB"; clubId: string; count: number; max: number }
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
  const { squad, sellPlayerId, buyPlayer, budget, maxPlayersPerClub = DEFAULT_SQUAD_CONFIG.maxPlayersPerClub } = input;
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

  // Effectif résultant (vendu retiré, acheté ajouté) : le nouveau joueur ne doit
  // pas faire dépasser la limite de joueurs d'un même club.
  const resultingClubCount = squad.filter((p) => p.id !== sellPlayerId && p.clubId === buyPlayer.clubId).length + 1;
  if (resultingClubCount > maxPlayersPerClub) {
    errors.push({ code: "TOO_MANY_PLAYERS_FROM_CLUB", clubId: buyPlayer.clubId, count: resultingClubCount, max: maxPlayersPerClub });
  }

  const newBudget = sellPlayer ? budget + sellPlayer.marketValue - buyPlayer.marketValue : budget;
  if (newBudget < 0) {
    errors.push({ code: "BUDGET_EXCEEDED", budget, shortfall: Math.round(-newBudget * 10) / 10 });
  }

  return { valid: errors.length === 0, errors, newBudget: Math.round(newBudget * 10) / 10 };
}
