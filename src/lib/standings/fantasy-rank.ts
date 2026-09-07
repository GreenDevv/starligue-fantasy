// Classement général fantasy — fonctions pures, testées (fantasy-rank.test.ts).
// Alimente le snapshot par journée (FantasyStandingSnapshot) et l'évolution ▲/▼ du
// récap de journée. Le classement des CLUBS LNH est ailleurs (compute.ts, règles
// sportives 2/1/0) — ici on classe des équipes fantasy au cumul de points.

export interface RankableTeam {
  teamId: string;
  leagueId: string;
  cumulativePoints: number;
}

export interface RankedTeam extends RankableTeam {
  globalRank: number;
  leagueRank: number;
}

// Rang standard « competition ranking » : ex aequo → même rang, le rang suivant
// saute (1, 2, 2, 4). Identique à la logique de GET /api/leaderboard
// (`count(points > x) + 1`), appliquée au niveau global ET dans chaque ligue.
function rankWithin(pool: RankableTeam[], target: RankableTeam): number {
  return pool.filter((t) => t.cumulativePoints > target.cumulativePoints).length + 1;
}

export function rankTeams(teams: RankableTeam[]): RankedTeam[] {
  const byLeague = new Map<string, RankableTeam[]>();
  for (const t of teams) {
    const arr = byLeague.get(t.leagueId);
    if (arr) arr.push(t);
    else byLeague.set(t.leagueId, [t]);
  }

  return teams.map((t) => ({
    ...t,
    globalRank: rankWithin(teams, t),
    leagueRank: rankWithin(byLeague.get(t.leagueId) ?? [t], t),
  }));
}

// Évolution du rang entre deux journées : positif = places gagnées (on monte au
// classement), négatif = places perdues, 0 = stable.
// previousRank null (aucun snapshot antérieur : 1ʳᵉ journée, ou équipe validée en
// cours de saison) → null : pas d'évolution à afficher.
export function rankDelta(previousRank: number | null, currentRank: number): number | null {
  if (previousRank === null) return null;
  return previousRank - currentRank;
}
