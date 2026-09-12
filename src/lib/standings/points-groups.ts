// Regroupement visuel des lignes du classement par nombre de points égal —
// fonction pure, testée. Utilisée par ClubStandingsWidget/StandingsSection pour
// alterner une teinte de fond très légère entre deux groupes de points
// différents (les égalités de points restent visuellement continues, sans
// nouvelle teinte à chaque ligne) — ARCHITECTURE.md §31.
export function computePointsGroupIndices(rows: { points: number }[]): number[] {
  const indices: number[] = [];
  let currentGroup = -1;
  let lastPoints: number | null = null;
  for (const row of rows) {
    if (row.points !== lastPoints) {
      currentGroup++;
      lastPoints = row.points;
    }
    indices.push(currentGroup);
  }
  return indices;
}

// true si ce club n'a pas encore joué la journée en cours (`gameweekNumber`,
// celle du dernier snapshot — voir get.ts) : son compteur de matchs joués est en
// retard d'au moins un match sur les clubs qui ont déjà joué cette journée-là.
// Un simple coup d'œil à la colonne "J" suffirait en théorie, mais un badge
// visible évite de devoir comparer les lignes une à une — demande explicite.
export function hasPendingMatchThisRound(played: number, gameweekNumber: number | null): boolean {
  if (gameweekNumber === null) return false;
  return played < gameweekNumber;
}
