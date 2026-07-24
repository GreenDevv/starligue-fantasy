// Rapprochement des scores LNH scrapés (une saison passée) avec les joueurs
// existants — fonction pure testée, ARCHITECTURE.md/CLAUDE.md.
//
// Un joueur déjà en Starligue l'an dernier mais transféré vers un autre club cette
// saison a un score scrapé sous son ANCIEN club : le matching strict (nom+club)
// le rate. On tente donc un second passage par nom seul (sans club) pour ces
// joueurs, et on marque le résultat `matchedByNameOnly` pour rester traçable —
// jamais de correction silencieuse de l'affectation de club (cf. mémoire
// player-photos-sourcing / lnh-season-scores-endpoint).

import { normalize } from "./value-import";

export interface ScrapedScoreRow {
  firstName: string;
  lastName: string;
  clubShortName: string; // shortName résolu, ou slug lnh brut si le club n'existe pas chez nous
  matchesPlayed: number;
  totalScore: number;
}

export interface PlayerForScoreMatching {
  id: string;
  firstName: string;
  lastName: string;
  clubShortName: string;
}

export interface ScoreMatch {
  playerId: string;
  matchesPlayed: number;
  totalScore: number;
  avgScore: number;
  scrapedClub: string;
  matchedByNameOnly: boolean;
}

export type UnmatchedScoreReason = "player_not_found" | "ambiguous_match";

export interface UnmatchedScoreRow {
  row: ScrapedScoreRow;
  reason: UnmatchedScoreReason;
}

export interface MatchPlayerSeasonScoresResult {
  matches: ScoreMatch[];
  unmatched: UnmatchedScoreRow[];
}

function exactKey(lastName: string, firstName: string, club: string): string {
  return `${normalize(lastName)}|${normalize(firstName)}|${normalize(club)}`;
}

function nameKey(lastName: string, firstName: string): string {
  return `${normalize(lastName)}|${normalize(firstName)}`;
}

export function matchPlayerSeasonScores(
  rows: ScrapedScoreRow[],
  players: PlayerForScoreMatching[],
): MatchPlayerSeasonScoresResult {
  const byExactKey = new Map<string, PlayerForScoreMatching[]>();
  const byNameKey = new Map<string, PlayerForScoreMatching[]>();
  for (const p of players) {
    const ek = exactKey(p.lastName, p.firstName, p.clubShortName);
    const ekList = byExactKey.get(ek) ?? [];
    ekList.push(p);
    byExactKey.set(ek, ekList);

    const nk = nameKey(p.lastName, p.firstName);
    const nkList = byNameKey.get(nk) ?? [];
    nkList.push(p);
    byNameKey.set(nk, nkList);
  }

  const matches: ScoreMatch[] = [];
  const unmatched: UnmatchedScoreRow[] = [];

  for (const row of rows) {
    const ek = exactKey(row.lastName, row.firstName, row.clubShortName);
    const exactCandidates = byExactKey.get(ek) ?? [];

    let player: PlayerForScoreMatching | null = null;
    let matchedByNameOnly = false;

    if (exactCandidates.length === 1) {
      player = exactCandidates[0]!;
    } else if (exactCandidates.length === 0) {
      const nk = nameKey(row.lastName, row.firstName);
      const nameCandidates = byNameKey.get(nk) ?? [];
      if (nameCandidates.length === 1) {
        player = nameCandidates[0]!;
        matchedByNameOnly = true;
      } else if (nameCandidates.length > 1) {
        unmatched.push({ row, reason: "ambiguous_match" });
        continue;
      }
    } else {
      unmatched.push({ row, reason: "ambiguous_match" });
      continue;
    }

    if (!player) {
      unmatched.push({ row, reason: "player_not_found" });
      continue;
    }

    matches.push({
      playerId: player.id,
      matchesPlayed: row.matchesPlayed,
      totalScore: row.totalScore,
      avgScore: Math.round((row.totalScore / row.matchesPlayed) * 100) / 100,
      scrapedClub: row.clubShortName,
      matchedByNameOnly,
    });
  }

  return { matches, unmatched };
}
