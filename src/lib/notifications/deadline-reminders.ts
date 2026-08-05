// Sélection des utilisateurs à relancer avant une deadline — ARCHITECTURE.md
// §20.2. Fonctions PURES : aucun effet de bord, aucun import Prisma/FCM —
// c'est la route cron (src/app/api/cron/notify-deadlines/route.ts) qui
// charge les données et envoie les push.

export interface FantasyTeamLineupState {
  userId: string;
  isValidated: boolean;
  captainId: string | null;
}

/** Alignement non finalisé (pas validé, ou sans capitaine) avant la deadline de la journée. */
export function selectUsersForLineupReminder(teams: FantasyTeamLineupState[]): string[] {
  const userIds = teams
    .filter((team) => !team.isValidated || team.captainId === null)
    .map((team) => team.userId);
  return Array.from(new Set(userIds));
}

export interface FantasyTeamPredictionState {
  userId: string;
  fantasyTeamId: string;
}

/** Équipes qui n'ont pas encore pronostiqué le marché ouvert avant son verrouillage. */
export function selectUsersForPredictionReminder(
  teams: FantasyTeamPredictionState[],
  predictedFantasyTeamIds: string[]
): string[] {
  const predicted = new Set(predictedFantasyTeamIds);
  const userIds = teams
    .filter((team) => !predicted.has(team.fantasyTeamId))
    .map((team) => team.userId);
  return Array.from(new Set(userIds));
}
