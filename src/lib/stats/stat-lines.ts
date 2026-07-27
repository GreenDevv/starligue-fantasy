// Registre partagé des lignes de stats détaillées de match (boxscore lnh.fr).
// Fonction PURE, aucun import Prisma — réutilisé par le moteur de scoring
// (bonus/malus, src/lib/scoring/stat-leaders.ts), la validation Zod de
// GET /api/stats/leaders (whitelist des statKey acceptés) et le panneau UI
// (StatLeadersPanel : libellés + liste "ajouter une stat").
//
// "bonus" : le(s) leader(s) de la journée sur cette ligne reçoivent un bonus.
// "malus" : le(s) leader(s) de la journée sur cette ligne reçoivent un malus
// (pertes de balle, 2 min, disqualifications — être en tête n'est pas une
// bonne chose).
export interface StatLine {
  key: string;
  label: string;
  category: "bonus" | "malus";
}

export const STAT_LINES: StatLine[] = [
  { key: "goalsPlay", label: "Buts (tirs)", category: "bonus" },
  { key: "goalsPenalty", label: "Buts (penalty)", category: "bonus" },
  { key: "goalsTotal", label: "Total buts", category: "bonus" },
  { key: "shotPercentage", label: "% tirs", category: "bonus" },
  { key: "assists", label: "Dernière passe", category: "bonus" },
  { key: "ballsRecovered", label: "Ballons récupérés", category: "bonus" },
  { key: "opponentShotsBlocked", label: "Tirs adverses contrés", category: "bonus" },
  { key: "penaltiesDrawn", label: "Penaltys provoqués", category: "bonus" },
  { key: "twoMinDrawn", label: "2 min provoquées", category: "bonus" },
  { key: "neutralizations", label: "Neutralisations", category: "bonus" },
  { key: "saves", label: "Arrêts", category: "bonus" },
  { key: "savePercentage", label: "% arrêts", category: "bonus" },
  { key: "turnovers", label: "Pertes de balle", category: "malus" },
  { key: "twoMinTaken", label: "2 min", category: "malus" },
  { key: "disqualified", label: "Disqualifications", category: "malus" },
];

export const STAT_LINE_KEYS = STAT_LINES.map((s) => s.key) as [string, ...string[]];

export function getStatLine(key: string): StatLine | undefined {
  return STAT_LINES.find((s) => s.key === key);
}
