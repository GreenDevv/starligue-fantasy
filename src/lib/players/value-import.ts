// Rapprochement des lignes d'un fichier de valorisation (nom, prénom, club, valeur)
// avec les joueurs existants en base — logique métier pure, ARCHITECTURE.md/CLAUDE.md
// (fonctions pures testées, pas de création implicite de joueur).

export interface PlayerValueRow {
  nom: string;
  prenom: string;
  club: string;
  valeur: number;
}

export interface PlayerForMatching {
  id: string;
  firstName: string;
  lastName: string;
  clubShortName: string;
  marketValue: number;
}

export interface ValueMatch {
  playerId: string;
  firstName: string;
  lastName: string;
  clubShortName: string;
  oldValue: number;
  newValue: number;
}

export type UnmatchedReason = "player_not_found" | "ambiguous_match";

export interface UnmatchedRow {
  row: PlayerValueRow;
  reason: UnmatchedReason;
}

export interface MatchPlayerValuesResult {
  updates: ValueMatch[]; // valeur différente de la valeur actuelle → à appliquer
  unchanged: ValueMatch[]; // valeur identique → rien à faire
  unmatched: UnmatchedRow[];
}

const COMBINING_DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .replace(/[-\s]+/g, " ")
    .trim();
}

function matchKey(lastName: string, firstName: string, clubShortName: string): string {
  return `${normalize(lastName)}|${normalize(firstName)}|${normalize(clubShortName)}`;
}

export function matchPlayerValueRows(
  rows: PlayerValueRow[],
  players: PlayerForMatching[],
): MatchPlayerValuesResult {
  const byKey = new Map<string, PlayerForMatching[]>();
  for (const p of players) {
    const key = matchKey(p.lastName, p.firstName, p.clubShortName);
    const list = byKey.get(key) ?? [];
    list.push(p);
    byKey.set(key, list);
  }

  const updates: ValueMatch[] = [];
  const unchanged: ValueMatch[] = [];
  const unmatched: UnmatchedRow[] = [];

  for (const row of rows) {
    const key = matchKey(row.nom, row.prenom, row.club);
    const candidates = byKey.get(key) ?? [];

    if (candidates.length === 0) {
      unmatched.push({ row, reason: "player_not_found" });
      continue;
    }
    if (candidates.length > 1) {
      unmatched.push({ row, reason: "ambiguous_match" });
      continue;
    }

    const player = candidates[0]!;
    const match: ValueMatch = {
      playerId: player.id,
      firstName: player.firstName,
      lastName: player.lastName,
      clubShortName: player.clubShortName,
      oldValue: player.marketValue,
      newValue: row.valeur,
    };

    if (Math.abs(player.marketValue - row.valeur) < 0.05) {
      unchanged.push(match);
    } else {
      updates.push(match);
    }
  }

  return { updates, unchanged, unmatched };
}
