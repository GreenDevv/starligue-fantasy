// Classement d'un groupe de phase de groupes EHF (Champions League/European
// League, ARCHITECTURE.md §19) à partir des résultats déjà connus — fonction pure
// (testée), même règles que computeClubStandings (src/lib/standings/compute.ts :
// victoire 2 pts, nul 1 pt, défaite 0 pt, tie-break points puis diff de buts puis
// buts pour) mais keyed par NOM d'équipe plutôt que clubId : la plupart des
// équipes d'un groupe EHF ne sont pas des clubs Starligue connus de notre DB (une
// seule instance dupliquée plutôt qu'une généralisation de computeClubStandings —
// les deux domaines (championnat Starligue vs groupe EHF) n'ont dans les faits que
// les règles de points en commun, pas la même forme de données).
const POINTS_WIN = 2;
const POINTS_DRAW = 1;
const POINTS_LOSS = 0;

export interface GroupStandingMatch {
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
}

export interface GroupTeamStanding {
  teamName: string;
  rank: number;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
}

interface Accumulator {
  teamName: string;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

export function computeGroupStandings(teamNames: string[], matches: GroupStandingMatch[]): GroupTeamStanding[] {
  const byName = new Map<string, Accumulator>();
  for (const name of teamNames) {
    byName.set(name, { teamName: name, points: 0, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 });
  }

  for (const m of matches) {
    if (m.homeScore === null || m.awayScore === null) continue; // pas encore joué
    const home = byName.get(m.homeTeamName);
    const away = byName.get(m.awayTeamName);
    if (!home || !away) continue;

    home.played++;
    away.played++;
    home.goalsFor += m.homeScore;
    home.goalsAgainst += m.awayScore;
    away.goalsFor += m.awayScore;
    away.goalsAgainst += m.homeScore;

    if (m.homeScore > m.awayScore) {
      home.points += POINTS_WIN;
      home.wins++;
      away.points += POINTS_LOSS;
      away.losses++;
    } else if (m.homeScore < m.awayScore) {
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

  const sorted = [...byName.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const diffA = a.goalsFor - a.goalsAgainst;
    const diffB = b.goalsFor - b.goalsAgainst;
    if (diffB !== diffA) return diffB - diffA;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.teamName.localeCompare(b.teamName);
  });

  return sorted.map((entry, i) => ({
    teamName: entry.teamName,
    rank: i + 1,
    points: entry.points,
    played: entry.played,
    wins: entry.wins,
    draws: entry.draws,
    losses: entry.losses,
    goalsFor: entry.goalsFor,
    goalsAgainst: entry.goalsAgainst,
    goalDiff: entry.goalsFor - entry.goalsAgainst,
  }));
}
