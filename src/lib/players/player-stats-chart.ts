// Construction pure des points du graphique "stats par journée"
// (src/components/charts/PlayerStatsChart.tsx) — utilisée par
// src/lib/players/player-detail.ts (source unique pour le joueur principal ET le
// joueur comparé, cf. GET /api/players/[id]/detail).
import { CHARTABLE_STAT_LINES } from "@/lib/stats/stat-chart-colors";

export interface PlayerStatsChartOpponent {
  shortName: string;
  name?: string;
  logoUrl?: string | null;
}

export interface PlayerStatsChartEntry {
  gameweekNumber: number;
  values: Record<string, number>;
  opponent?: PlayerStatsChartOpponent;
}

interface StatRowForChart {
  [key: string]: unknown;
  match: {
    homeClubId: string;
    awayClubId: string;
    gameweek: { number: number };
    homeClub: PlayerStatsChartOpponent;
    awayClub: PlayerStatsChartOpponent;
  };
}

// Pure — testable indépendamment de Prisma.
export function buildPlayerStatsChartEntries(
  stats: StatRowForChart[],
  playerClubId: string
): PlayerStatsChartEntry[] {
  const sorted = [...stats].sort((a, b) => a.match.gameweek.number - b.match.gameweek.number);
  return sorted.map((s) => {
    const values: Record<string, number> = {};
    for (const line of CHARTABLE_STAT_LINES) {
      values[line.key] = Number(s[line.key] ?? 0) || 0;
    }
    const isHome = playerClubId === s.match.homeClubId;
    return {
      gameweekNumber: s.match.gameweek.number,
      values,
      opponent: isHome ? s.match.awayClub : s.match.homeClub,
    };
  });
}
