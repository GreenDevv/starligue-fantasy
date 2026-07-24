// Calcule la prochaine journée à avancer pour la saison de simulation — pure,
// testée. null = saison déjà terminée (toutes les journées jouées).
export function planNextGameweek(currentGameweekNumber: number, totalGameweeks: number): number | null {
  const next = currentGameweekNumber + 1;
  return next <= totalGameweeks ? next : null;
}

// Calcule la journée à annuler pour reculer d'un cran dans la saison simulée —
// pure, testée. null = déjà à J0 (rien à annuler). Retourne le NUMÉRO de la
// journée à annuler (= le curseur courant), pas le nouveau curseur.
export function planPreviousGameweek(currentGameweekNumber: number): number | null {
  return currentGameweekNumber > 0 ? currentGameweekNumber : null;
}
