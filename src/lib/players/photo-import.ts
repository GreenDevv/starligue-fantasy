// Rapprochement des photos joueurs trouvées sur les sites officiels de club avec
// les joueurs existants en base — même philosophie que value-import.ts (fonction
// pure testée, jamais de création/suppression de joueur, matching nom+club normalisé).

import { normalize } from "./value-import";

export interface PlayerPhotoRow {
  nom: string;
  prenom: string;
  club: string;
  photoUrl: string;
}

export interface PlayerForPhotoMatching {
  id: string;
  firstName: string;
  lastName: string;
  clubShortName: string;
  photoUrl: string | null;
}

export interface PhotoMatch {
  playerId: string;
  firstName: string;
  lastName: string;
  clubShortName: string;
  oldPhotoUrl: string | null;
  newPhotoUrl: string;
}

export type UnmatchedPhotoReason = "player_not_found" | "ambiguous_match";

export interface UnmatchedPhotoRow {
  row: PlayerPhotoRow;
  reason: UnmatchedPhotoReason;
}

export interface MatchPlayerPhotosResult {
  updates: PhotoMatch[]; // photoUrl différent de l'actuel → à appliquer
  unchanged: PhotoMatch[]; // photoUrl déjà identique → rien à faire
  unmatched: UnmatchedPhotoRow[];
}

function matchKey(lastName: string, firstName: string, clubShortName: string): string {
  return `${normalize(lastName)}|${normalize(firstName)}|${normalize(clubShortName)}`;
}

export function matchPlayerPhotoRows(
  rows: PlayerPhotoRow[],
  players: PlayerForPhotoMatching[],
): MatchPlayerPhotosResult {
  const byKey = new Map<string, PlayerForPhotoMatching[]>();
  for (const p of players) {
    const key = matchKey(p.lastName, p.firstName, p.clubShortName);
    const list = byKey.get(key) ?? [];
    list.push(p);
    byKey.set(key, list);
  }

  const updates: PhotoMatch[] = [];
  const unchanged: PhotoMatch[] = [];
  const unmatched: UnmatchedPhotoRow[] = [];

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
    const match: PhotoMatch = {
      playerId: player.id,
      firstName: player.firstName,
      lastName: player.lastName,
      clubShortName: player.clubShortName,
      oldPhotoUrl: player.photoUrl,
      newPhotoUrl: row.photoUrl,
    };

    if (player.photoUrl === row.photoUrl) {
      unchanged.push(match);
    } else {
      updates.push(match);
    }
  }

  return { updates, unchanged, unmatched };
}
