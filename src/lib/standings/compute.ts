// Calcul du classement des clubs (fonction pure, testée) — utilisé pour la saison
// de simulation 2025/26 (la saison live 2026/27 copie le classement officiel LNH
// tel quel, cf. src/lib/data-providers/lnh-scraper.provider.ts::fetchStandings).
// Règles officielles LNH (mêmes que celles affichées en bas de
// daikin-starligue/classement) : victoire 2 pts, nul 1 pt, défaite 0 pt.
const POINTS_WIN = 2;
const POINTS_DRAW = 1;
const POINTS_LOSS = 0;

export interface StandingClubInput {
  id: string;
  name: string; // seul le tie-break final s'en sert
}

export interface StandingMatchResult {
  homeClubId: string;
  awayClubId: string;
  homeScore: number;
  awayScore: number;
}

export interface ComputedClubStanding {
  clubId: string;
  rank: number;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalAvg: number;
}

interface Accumulator {
  clubId: string;
  name: string;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

// Tie-break simplifié : points desc, goal avg desc, buts pour desc, nom asc (déterministe).
// La LNH applique des critères supplémentaires en cas d'égalité (confrontations
// directes, etc., règlement sportif art. 2122) — non reproduits ici, pas demandé.
export function computeClubStandings(
  clubs: StandingClubInput[],
  results: StandingMatchResult[]
): ComputedClubStanding[] {
  const byClubId = new Map<string, Accumulator>();
  for (const club of clubs) {
    byClubId.set(club.id, {
      clubId: club.id,
      name: club.name,
      points: 0,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
    });
  }

  for (const result of results) {
    const home = byClubId.get(result.homeClubId);
    const away = byClubId.get(result.awayClubId);
    if (!home || !away) continue;

    home.played++;
    away.played++;
    home.goalsFor += result.homeScore;
    home.goalsAgainst += result.awayScore;
    away.goalsFor += result.awayScore;
    away.goalsAgainst += result.homeScore;

    if (result.homeScore > result.awayScore) {
      home.points += POINTS_WIN;
      home.wins++;
      away.points += POINTS_LOSS;
      away.losses++;
    } else if (result.homeScore < result.awayScore) {
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
    const avgA = a.goalsFor - a.goalsAgainst;
    const avgB = b.goalsFor - b.goalsAgainst;
    if (avgB !== avgA) return avgB - avgA;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.name.localeCompare(b.name);
  });

  return sorted.map((entry, i) => ({
    clubId: entry.clubId,
    rank: i + 1,
    points: entry.points,
    played: entry.played,
    wins: entry.wins,
    draws: entry.draws,
    losses: entry.losses,
    goalsFor: entry.goalsFor,
    goalsAgainst: entry.goalsAgainst,
    goalAvg: entry.goalsFor - entry.goalsAgainst,
  }));
}
