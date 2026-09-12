// Merge des buts marqués dans des matchs actuellement LIVE sur un classement de
// buteurs déjà calculé (fonction pure, testée) — voir get-stat-leaders.ts et
// ARCHITECTURE.md §24. Les buts comptés en direct viennent de MatchLiveEvent
// (icônes "goals"/"goals_7m", scorer résolu par resolve-event-player.ts), pas de
// PlayerMatchStat qui n'existe qu'une fois le boxscore officiel synchronisé après
// le match.
export interface RankedPlayerValue {
  playerId: string;
  value: number;
}

export function mergeLiveGoals(
  ranked: RankedPlayerValue[],
  liveGoalsByPlayer: Map<string, number>
): RankedPlayerValue[] {
  if (liveGoalsByPlayer.size === 0) return ranked;

  const byPlayerId = new Map(ranked.map((r) => [r.playerId, { ...r }]));
  for (const [playerId, liveGoals] of liveGoalsByPlayer) {
    const existing = byPlayerId.get(playerId);
    if (existing) {
      existing.value += liveGoals;
    } else {
      // Un joueur qui marque en direct mais n'a pas encore de ligne dans le
      // classement officiel (pas encore marqué cette saison/journée, ou tout
      // simplement pas dans le top déjà calculé) doit pouvoir apparaître.
      byPlayerId.set(playerId, { playerId, value: liveGoals });
    }
  }
  return [...byPlayerId.values()];
}
