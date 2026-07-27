// Validation de l'exécution d'un trade (joueur(s) contre joueur(s) + budget) entre
// deux FantasyTeam de la même ligue — fonction PURE, aucun import Prisma. Suit le
// pattern de src/lib/transfers/validate.ts. Réutilise validateSquad (2 joueurs par
// poste) sans re-checker le budget total du squad — comme validateTransfer, seul le
// solde de budget après l'opération est contrôlé, pas la somme des marketValue.

import { validateSquad, DEFAULT_SQUAD_CONFIG, type SquadPlayer, type ValidationError } from "@/lib/squad/validation";

export interface TradeExecutionInput {
  proposerSquad: SquadPlayer[];
  proposerBudget: number;
  receiverSquad: SquadPlayer[];
  receiverBudget: number;
  offeredPlayerIds: string[]; // pris dans proposerSquad, remis à receiverSquad
  requestedPlayerIds: string[]; // pris dans receiverSquad, remis à proposerSquad
  budgetAdjustment: number; // proposeur → destinataire (négatif = sens inverse)
  maxPlayersPerClub?: number; // défaut DEFAULT_SQUAD_CONFIG.maxPlayersPerClub (3)
}

export type TradeError =
  | { code: "EMPTY_TRADE" }
  | { code: "PLAYER_NOT_IN_SQUAD"; side: "PROPOSER" | "RECEIVER"; playerId: string }
  | { code: "DUPLICATE_PLAYER"; playerId: string }
  | { code: "INACTIVE_PLAYER"; playerId: string }
  | { code: "INVALID_RESULTING_SQUAD"; side: "PROPOSER" | "RECEIVER"; errors: ValidationError[] }
  | { code: "BUDGET_EXCEEDED"; side: "PROPOSER" | "RECEIVER"; shortfall: number };

export interface TradeExecutionResult {
  valid: boolean;
  errors: TradeError[];
  newProposerBudget: number;
  newReceiverBudget: number;
}

function swapSquad(squad: SquadPlayer[], remove: Set<string>, add: SquadPlayer[]): SquadPlayer[] {
  return [...squad.filter((p) => !remove.has(p.id)), ...add];
}

export function validateTradeExecution(input: TradeExecutionInput): TradeExecutionResult {
  const {
    proposerSquad,
    proposerBudget,
    receiverSquad,
    receiverBudget,
    offeredPlayerIds,
    requestedPlayerIds,
    budgetAdjustment,
    maxPlayersPerClub = DEFAULT_SQUAD_CONFIG.maxPlayersPerClub,
  } = input;
  const errors: TradeError[] = [];

  if (offeredPlayerIds.length === 0 && requestedPlayerIds.length === 0) {
    errors.push({ code: "EMPTY_TRADE" });
  }

  const overlap = offeredPlayerIds.filter((id) => requestedPlayerIds.includes(id));
  for (const id of overlap) {
    errors.push({ code: "DUPLICATE_PLAYER", playerId: id });
  }

  const offeredPlayers: SquadPlayer[] = [];
  for (const id of offeredPlayerIds) {
    const player = proposerSquad.find((p) => p.id === id);
    if (!player) {
      errors.push({ code: "PLAYER_NOT_IN_SQUAD", side: "PROPOSER", playerId: id });
      continue;
    }
    if (!player.isActive) errors.push({ code: "INACTIVE_PLAYER", playerId: id });
    offeredPlayers.push(player);
  }

  const requestedPlayers: SquadPlayer[] = [];
  for (const id of requestedPlayerIds) {
    const player = receiverSquad.find((p) => p.id === id);
    if (!player) {
      errors.push({ code: "PLAYER_NOT_IN_SQUAD", side: "RECEIVER", playerId: id });
      continue;
    }
    if (!player.isActive) errors.push({ code: "INACTIVE_PLAYER", playerId: id });
    requestedPlayers.push(player);
  }

  const resultingProposerSquad = swapSquad(proposerSquad, new Set(offeredPlayerIds), requestedPlayers);
  const resultingReceiverSquad = swapSquad(receiverSquad, new Set(requestedPlayerIds), offeredPlayers);

  const proposerSquadCheck = validateSquad(resultingProposerSquad, {
    playersPerPosition: 2,
    budget: Number.POSITIVE_INFINITY,
    maxPlayersPerClub,
  });
  if (!proposerSquadCheck.valid) {
    errors.push({
      code: "INVALID_RESULTING_SQUAD",
      side: "PROPOSER",
      errors: proposerSquadCheck.errors.filter((e) => e.code !== "BUDGET_EXCEEDED"),
    });
  }

  const receiverSquadCheck = validateSquad(resultingReceiverSquad, {
    playersPerPosition: 2,
    budget: Number.POSITIVE_INFINITY,
    maxPlayersPerClub,
  });
  if (!receiverSquadCheck.valid) {
    errors.push({
      code: "INVALID_RESULTING_SQUAD",
      side: "RECEIVER",
      errors: receiverSquadCheck.errors.filter((e) => e.code !== "BUDGET_EXCEEDED"),
    });
  }

  const newProposerBudget = Math.round((proposerBudget - budgetAdjustment) * 10) / 10;
  const newReceiverBudget = Math.round((receiverBudget + budgetAdjustment) * 10) / 10;

  if (newProposerBudget < 0) {
    errors.push({ code: "BUDGET_EXCEEDED", side: "PROPOSER", shortfall: Math.round(-newProposerBudget * 10) / 10 });
  }
  if (newReceiverBudget < 0) {
    errors.push({ code: "BUDGET_EXCEEDED", side: "RECEIVER", shortfall: Math.round(-newReceiverBudget * 10) / 10 });
  }

  return { valid: errors.length === 0, errors, newProposerBudget, newReceiverBudget };
}

export type ResolvedTradeStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "EXPIRED";

/**
 * Résout le statut EFFECTIF d'une proposition : un PENDING dont la date d'expiration
 * est dépassée est traité comme EXPIRED, même si la ligne en base n'a pas encore été
 * mise à jour (mise à jour paresseuse côté appelant, pas de cron dédié).
 */
export function resolveTradeStatus(status: ResolvedTradeStatus, expiresAt: Date, now: Date): ResolvedTradeStatus {
  if (status === "PENDING" && now > expiresAt) return "EXPIRED";
  return status;
}
