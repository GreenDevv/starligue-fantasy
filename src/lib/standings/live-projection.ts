// Projection "en direct" du classement général Starligue (fonction pure, testée)
// — voir ARCHITECTURE.md §25. Le classement live 2026/27 fait normalement autorité
// LNH (copie brute de daikin-starligue/classement, cf. live-sync.ts), mais cette
// page officielle ne se met à jour qu'une fois un match terminé et publié par la
// LNH — pas pendant qu'il se joue. Pour donner un classement qui bouge pendant les
// matchs, on part du dernier classement confirmé (snapshot officiel) et on y
// superpose les rencontres actuellement LIVE, comme si elles se terminaient au
// score courant. Mêmes règles de points (2/1/0) et même tie-break simplifié que
// src/lib/standings/compute.ts (mais appliqué à des lignes déjà agrégées plutôt
// qu'à une liste de résultats bruts).
import type { ClubStandingRow } from "./get";

const POINTS_WIN = 2;
const POINTS_DRAW = 1;
const POINTS_LOSS = 0;

export interface LiveMatchScore {
  homeClubId: string;
  awayClubId: string;
  homeScore: number;
  awayScore: number;
}

export function projectLiveStandings(baseline: ClubStandingRow[], liveMatches: LiveMatchScore[]): ClubStandingRow[] {
  if (liveMatches.length === 0) return baseline;

  const byClubId = new Map(baseline.map((row) => [row.clubId, { ...row }]));

  for (const match of liveMatches) {
    const home = byClubId.get(match.homeClubId);
    const away = byClubId.get(match.awayClubId);
    if (!home || !away) continue; // club sans ligne de classement (ne devrait pas arriver) — ignoré

    home.played++;
    away.played++;
    home.goalsFor += match.homeScore;
    home.goalsAgainst += match.awayScore;
    away.goalsFor += match.awayScore;
    away.goalsAgainst += match.homeScore;
    home.goalAvg = home.goalsFor - home.goalsAgainst;
    away.goalAvg = away.goalsFor - away.goalsAgainst;

    if (match.homeScore > match.awayScore) {
      home.points += POINTS_WIN;
      home.wins++;
      away.points += POINTS_LOSS;
      away.losses++;
    } else if (match.homeScore < match.awayScore) {
      away.points += POINTS_WIN;
      away.wins++;
      home.points += POINTS_LOSS;
      home.losses++;
    } else {
      home.points += POINTS_DRAW;
      away.points += POINTS_DRAW;
      home.draws++;
      away.draws++;
    }
  }

  const sorted = [...byClubId.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalAvg !== a.goalAvg) return b.goalAvg - a.goalAvg;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.clubName.localeCompare(b.clubName);
  });

  return sorted.map((row, i) => ({ ...row, rank: i + 1 }));
}
