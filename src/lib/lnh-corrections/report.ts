// Construit le "compte rendu" d'une application de corrections LNH : pour chaque
// équipe fantasy dont les points de la journée ont bougé, l'écart de points, l'écart
// de rang, et les corrections qui la concernent directement (un joueur qu'elle
// alignait) — le reste étant un impact indirect via le bonus "leader de journée"
// (src/lib/scoring/stat-leaders.ts), calculé sur toute la ligue.
//
// Fonction pure, testée (report.test.ts).

export interface AppliedCorrectionSummary {
  playerId: string;
  playerName: string;
  club: string;
  ratingBefore: number | null;
  ratingAfter: number | null;
  ratingChanged: boolean;
  /** Nombre de champs de stats détaillées (hors note) corrigés pour ce joueur. */
  otherFieldCount: number;
}

export interface TeamMeta {
  teamId: string;
  userId: string;
  email: string;
  teamName: string;
  leagueName: string;
}

export interface TeamPointState {
  points: number;
  globalRank: number | null;
  leagueRank: number | null;
}

export interface ImpactRow extends TeamMeta {
  pointsBefore: number;
  pointsAfter: number;
  delta: number;
  globalRankBefore: number | null;
  globalRankAfter: number | null;
  leagueRankBefore: number | null;
  leagueRankAfter: number | null;
  /** Corrections portant sur un joueur que cette équipe alignait (titulaire ou banc). */
  directCorrections: AppliedCorrectionSummary[];
  /** true = points modifiés sans qu'aucun joueur aligné n'ait été corrigé (effet leader de journée). */
  indirect: boolean;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface BuildImpactRowsInput {
  teams: TeamMeta[];
  before: Map<string, TeamPointState>;
  after: Map<string, TeamPointState>;
  /** playerId → résumé de la correction appliquée à ce joueur. */
  appliedByPlayerId: Map<string, AppliedCorrectionSummary>;
  /** teamId → ids des joueurs alignés (titulaires + banc) sur la journée. */
  fieldedPlayerIdsByTeam: Map<string, Set<string>>;
  /** Seuil d'écart de points en deçà duquel on ignore l'équipe (bruit d'arrondi). */
  epsilon?: number;
}

export function buildImpactRows({
  teams,
  before,
  after,
  appliedByPlayerId,
  fieldedPlayerIdsByTeam,
  epsilon = 0.05,
}: BuildImpactRowsInput): ImpactRow[] {
  const rows: ImpactRow[] = [];

  for (const team of teams) {
    const b = before.get(team.teamId);
    const a = after.get(team.teamId);
    if (!b || !a) continue;

    const delta = round1(a.points - b.points);
    if (Math.abs(delta) < epsilon) continue;

    const fielded = fieldedPlayerIdsByTeam.get(team.teamId) ?? new Set<string>();
    const directCorrections: AppliedCorrectionSummary[] = [];
    for (const playerId of fielded) {
      const applied = appliedByPlayerId.get(playerId);
      if (applied) directCorrections.push(applied);
    }
    directCorrections.sort((x, y) => {
      const dx = Math.abs((x.ratingAfter ?? 0) - (x.ratingBefore ?? 0));
      const dy = Math.abs((y.ratingAfter ?? 0) - (y.ratingBefore ?? 0));
      return dy - dx;
    });

    rows.push({
      ...team,
      pointsBefore: round1(b.points),
      pointsAfter: round1(a.points),
      delta,
      globalRankBefore: b.globalRank,
      globalRankAfter: a.globalRank,
      leagueRankBefore: b.leagueRank,
      leagueRankAfter: a.leagueRank,
      directCorrections,
      indirect: directCorrections.length === 0,
    });
  }

  rows.sort((x, y) => {
    if (Math.abs(y.delta) !== Math.abs(x.delta)) return Math.abs(y.delta) - Math.abs(x.delta);
    return x.teamName.localeCompare(y.teamName);
  });

  return rows;
}
