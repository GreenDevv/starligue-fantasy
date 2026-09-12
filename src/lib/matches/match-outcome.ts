// Résultat d'un match pour l'équipe d'un joueur donné (V/N/D, convention déjà
// utilisée partout ailleurs — colonnes du classement, ClubStandingsWidget) —
// fonction pure, testée. `null` tant que le match n'est pas terminé : un score
// en cours peut encore changer, pas de résultat définitif à afficher.
export type MatchOutcome = "V" | "N" | "D";

export function matchOutcomeForTeam(
  isHome: boolean,
  homeScore: number | null,
  awayScore: number | null,
  status: string
): MatchOutcome | null {
  if (status !== "FINISHED" || homeScore === null || awayScore === null) return null;
  const own = isHome ? homeScore : awayScore;
  const opponent = isHome ? awayScore : homeScore;
  if (own > opponent) return "V";
  if (own < opponent) return "D";
  return "N";
}
