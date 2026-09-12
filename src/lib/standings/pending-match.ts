// true si ce club n'a pas encore joué la journée en cours (`gameweekNumber`,
// celle du dernier snapshot — voir get.ts) : son compteur de matchs joués est en
// retard d'au moins un match sur les clubs qui ont déjà joué cette journée-là.
// Un simple coup d'œil à la colonne "J" suffirait en théorie, mais un badge
// visible (à côté du logo, jamais dans la colonne "J" elle-même — pas
// d'alignement à casser) évite de devoir comparer les lignes une à une —
// demande explicite, ARCHITECTURE.md §31.
export function hasPendingMatchThisRound(played: number, gameweekNumber: number | null): boolean {
  if (gameweekNumber === null) return false;
  return played < gameweekNumber;
}
