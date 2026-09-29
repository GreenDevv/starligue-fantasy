// Aiguillage de l'ingestion selon la compétition servie — ARCHITECTURE.md §35.4.
//
// Le pipeline de clôture de journée (/api/cron/settle-gameweek) n'a que trois
// étapes propres à la source de données : calendrier, stats de la journée,
// classement. Le reste (snapshot des alignements, points, actus) est commun.
// Côté LNH, ce sont exactement les appels d'avant (mêmes fonctions, mêmes
// constantes) : aucun changement de comportement pour le jeu masculin.

import { getCompetitionId, type CompetitionId } from "@/lib/competition/profile";
import { syncCalendarsIdsForSeason, syncGameweekBoxscore } from "./boxscore";
import { syncLiveClubStandings } from "@/lib/standings/live-sync";
import { confirmLfhGameweeks, syncLfhGameweekStats, syncLfhSeasonCalendar, syncLfhStandings } from "./lfh";

// Saison LNH servie (lnh.fr seasons_id 40 = 2026/2027), auparavant en dur dans la route.
export const LNH_SEASONS_ID = "40";
export const LNH_SEASON_START_YEAR = 2026;

export interface CompetitionIngestion {
  syncSeasonCalendar(seasonId: string): Promise<unknown>;
  syncGameweekStats(gameweekId: string): Promise<{ statsUpserted: number }>;
  syncStandings(seasonId: string, gameweekNumber: number): Promise<unknown>;
  /**
   * Passage au 🟢 des journées notées. Absent côté LNH : c'est le cron
   * corrections du mardi (/api/cron/lnh-corrections, §4.3) qui s'en charge.
   */
  confirmGameweeks?(seasonId: string): Promise<unknown>;
}

const LNH_INGESTION: CompetitionIngestion = {
  syncSeasonCalendar: (seasonId) => syncCalendarsIdsForSeason(seasonId, LNH_SEASONS_ID, LNH_SEASON_START_YEAR),
  syncGameweekStats: (gameweekId) => syncGameweekBoxscore(gameweekId, LNH_SEASONS_ID),
  syncStandings: (seasonId, gameweekNumber) => syncLiveClubStandings(seasonId, LNH_SEASONS_ID, gameweekNumber),
};

const LFH_INGESTION: CompetitionIngestion = {
  syncSeasonCalendar: syncLfhSeasonCalendar,
  syncGameweekStats: syncLfhGameweekStats,
  syncStandings: syncLfhStandings,
  confirmGameweeks: (seasonId) => confirmLfhGameweeks(seasonId),
};

export function getCompetitionIngestion(id: CompetitionId = getCompetitionId()): CompetitionIngestion {
  return id === "LFH" ? LFH_INGESTION : LNH_INGESTION;
}
