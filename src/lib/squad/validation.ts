// Validations squad/lineup — ARCHITECTURE.md §2.1, §2.2
// Fonctions PURES — aucun import Prisma.

export type Position = "GK" | "LW" | "LB" | "CB" | "RB" | "RW" | "PV";
export const POSITIONS: Position[] = ["GK", "LW", "LB", "CB", "RB", "RW", "PV"];

export interface SquadPlayer {
  id: string;
  position: Position;
  marketValue: number;
  isActive: boolean;
  clubId: string;
}

export interface SquadConfig {
  playersPerPosition: number; // 2
  budget: number;             // 100.0
  maxPlayersPerClub: number;  // 3
}

export const DEFAULT_SQUAD_CONFIG: SquadConfig = {
  playersPerPosition: 2,
  budget: 100.0,
  maxPlayersPerClub: 3,
};

export type ValidationError =
  | { code: "WRONG_SQUAD_SIZE"; expected: number; got: number }
  | { code: "WRONG_COUNT_AT_POSITION"; position: Position; expected: number; got: number }
  | { code: "BUDGET_EXCEEDED"; budget: number; total: number; overage: number }
  | { code: "INACTIVE_PLAYER"; playerId: string }
  | { code: "DUPLICATE_PLAYER"; playerId: string }
  | { code: "TOO_MANY_PLAYERS_FROM_CLUB"; clubId: string; count: number; max: number }
  | { code: "WRONG_LINEUP_SIZE"; expected: number; got: number }
  | { code: "WRONG_STARTERS_AT_POSITION"; position: Position; expected: number; got: number }
  | { code: "PLAYER_NOT_IN_SQUAD"; playerId: string };

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Valide la composition d'un effectif de 14 joueurs.
 * §2.1 : 2 joueurs par poste × 7 postes.
 * §2.2 : Σ(marketValue) ≤ budget.
 */
export function validateSquad(
  players: SquadPlayer[],
  config: SquadConfig = DEFAULT_SQUAD_CONFIG,
): ValidationResult {
  const errors: ValidationError[] = [];
  const totalSlots = POSITIONS.length * config.playersPerPosition; // 14

  // Pas de doublons
  const ids = players.map((p) => p.id);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      errors.push({ code: "DUPLICATE_PLAYER", playerId: id });
    }
    seen.add(id);
  }

  // Tous actifs
  for (const p of players) {
    if (!p.isActive) {
      errors.push({ code: "INACTIVE_PLAYER", playerId: p.id });
    }
  }

  // Taille totale
  if (players.length !== totalSlots) {
    errors.push({ code: "WRONG_SQUAD_SIZE", expected: totalSlots, got: players.length });
  }

  // Répartition par poste
  for (const pos of POSITIONS) {
    const count = players.filter((p) => p.position === pos).length;
    if (count !== config.playersPerPosition) {
      errors.push({
        code: "WRONG_COUNT_AT_POSITION",
        position: pos,
        expected: config.playersPerPosition,
        got: count,
      });
    }
  }

  // Max joueurs d'un même club (évite un effectif concentré sur un seul club)
  const countByClub = new Map<string, number>();
  for (const p of players) {
    countByClub.set(p.clubId, (countByClub.get(p.clubId) ?? 0) + 1);
  }
  for (const [clubId, count] of countByClub) {
    if (count > config.maxPlayersPerClub) {
      errors.push({ code: "TOO_MANY_PLAYERS_FROM_CLUB", clubId, count, max: config.maxPlayersPerClub });
    }
  }

  // Budget
  const total = players.reduce((s, p) => s + p.marketValue, 0);
  const totalRounded = Math.round(total * 10) / 10;
  if (totalRounded > config.budget) {
    errors.push({
      code: "BUDGET_EXCEEDED",
      budget: config.budget,
      total: totalRounded,
      overage: Math.round((totalRounded - config.budget) * 10) / 10,
    });
  }

  return { valid: errors.length === 0, errors };
}

export interface LineupPlayer {
  id: string;
  position: Position;
  isStarter: boolean; // true = titulaire, false = remplaçant
}

/**
 * Valide l'alignement d'une journée.
 * §2.1 : 1 titulaire par poste (7 titulaires + 7 remplaçants).
 * Tous les joueurs doivent appartenir à l'effectif.
 */
export function validateLineup(
  lineup: LineupPlayer[],
  squadIds: Set<string>,
): ValidationResult {
  const errors: ValidationError[] = [];
  const starters = lineup.filter((p) => p.isStarter);
  const expected = POSITIONS.length; // 7

  if (starters.length !== expected) {
    errors.push({ code: "WRONG_LINEUP_SIZE", expected, got: starters.length });
  }

  // 1 titulaire par poste
  for (const pos of POSITIONS) {
    const count = starters.filter((p) => p.position === pos).length;
    if (count !== 1) {
      errors.push({ code: "WRONG_STARTERS_AT_POSITION", position: pos, expected: 1, got: count });
    }
  }

  // Tous dans l'effectif
  for (const p of lineup) {
    if (!squadIds.has(p.id)) {
      errors.push({ code: "PLAYER_NOT_IN_SQUAD", playerId: p.id });
    }
  }

  return { valid: errors.length === 0, errors };
}
