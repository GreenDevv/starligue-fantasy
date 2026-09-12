// Numérote chaque but marqué dans un match (1er, 2e, 3e…) par joueur, dans l'ordre
// chronologique — fonction pure, testée. Sert à enrichir la notification "But de X"
// avec son total de buts dans CE match (ARCHITECTURE.md §27), voir
// notify-live-events.ts.
export interface GoalEventForTally {
  sequence: number;
  playerId: string | null;
}

// clé = sequence de l'événement, valeur = rang du but pour ce joueur (1, 2, 3…) —
// seulement pour les événements avec un joueur résolu (un but sans buteur identifié
// n'a pas d'entrée).
export function tallyGoalsBySequence(events: GoalEventForTally[]): Map<number, number> {
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  const runningCountByPlayer = new Map<string, number>();
  const bySequence = new Map<number, number>();
  for (const e of sorted) {
    if (!e.playerId) continue;
    const next = (runningCountByPlayer.get(e.playerId) ?? 0) + 1;
    runningCountByPlayer.set(e.playerId, next);
    bySequence.set(e.sequence, next);
  }
  return bySequence;
}

export function frenchOrdinal(n: number): string {
  return n === 1 ? "1er" : `${n}e`;
}
