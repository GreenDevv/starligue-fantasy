// Données complètes de la page /players/[id] — extrait pour être réutilisé à
// l'identique par la page (joueur principal, SSR) ET par l'API de comparaison
// (GET /api/players/[id]/detail, joueur comparé, fetch client). Centraliser ici
// évite de dupliquer le piège anti-spoiler simulation (déjà rencontré 4x avant ce
// fichier, cf. club-page-data.ts/head-to-head.ts/get-match-detail.ts) à un 5e
// endroit : seul Season.currentSimulationGameweekNumber fait foi.
import { prisma } from "@/lib/db";
import { computePlayerPoints, parseScoringConfig } from "@/lib/scoring/engine";
import { STAT_LINES } from "@/lib/stats/stat-lines";
import { SIMULATION_SEASON_LABEL } from "@/lib/simulation/constants";
import { buildPlayerStatsChartEntries, type PlayerStatsChartEntry } from "./player-stats-chart";
import type { Position } from "@/lib/squad/validation";

export interface PlayerDetailMatchLogEntry {
  id: string;
  gameweekNumber: number;
  opponent: string;
  lnhRating: number | null;
  played: boolean;
  pts: number | null;
}

export interface PlayerDetailData {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  photoUrl: string | null;
  club: { id: string; name: string; shortName: string; logoUrl: string | null };
  marketValue: number;
  seasonId: string;
  seasonLabel: string;
  isSimulation: boolean;
  avgRating: number | null;
  seasonStatTotals: { key: string; label: string; category: "bonus" | "malus"; total: number }[];
  seasonShotPercentage: number | null;
  hasSeasonStats: boolean;
  chartEntries: PlayerStatsChartEntry[];
  valueHistoryPoints: { value: number; gameweekNumber: number | null }[];
  lnhSeasonStats: { id: string; seasonLabel: string; matchesPlayed: number; avgLnhScore: number }[];
  matchLog: PlayerDetailMatchLogEntry[];
}

export async function getPlayerDetailData(playerId: string): Promise<PlayerDetailData | null> {
  const [player, configs] = await Promise.all([
    prisma.player.findUnique({
      where: { id: playerId },
      include: {
        club: true,
        season: { select: { label: true } },
        stats: {
          include: {
            match: {
              include: {
                gameweek: { select: { number: true } },
                homeClub: { select: { shortName: true, name: true, logoUrl: true } },
                awayClub: { select: { shortName: true, name: true, logoUrl: true } },
              },
            },
          },
          orderBy: { match: { kickoffAt: "desc" } },
        },
        lnhSeasonStats: { orderBy: { seasonLabel: "desc" } },
        valueHistory: {
          orderBy: { changedAt: "asc" },
          include: { gameweek: { select: { number: true } } },
        },
      },
    }),
    prisma.gameConfig.findMany(),
  ]);
  if (!player) return null;

  const isSimulation = player.season.label === SIMULATION_SEASON_LABEL;
  let simulationCursor = 0;
  if (isSimulation) {
    const season = await prisma.season.findUnique({
      where: { id: player.seasonId },
      select: { currentSimulationGameweekNumber: true },
    });
    simulationCursor = season?.currentSimulationGameweekNumber ?? 0;
  }
  const isRevealed = (gameweekNumber: number) => !isSimulation || gameweekNumber <= simulationCursor;

  const revealedStats = player.stats.filter((s) => isRevealed(s.match.gameweek.number));
  const revealedValueHistory = player.valueHistory.filter(
    (h) => h.gameweek === null || isRevealed(h.gameweek.number)
  );

  const scoringConfig = parseScoringConfig(Object.fromEntries(configs.map((c) => [c.key, c.value])));

  const matchLog: PlayerDetailMatchLogEntry[] = revealedStats.map((s) => {
    const homeWon =
      s.match.homeScore !== null && s.match.awayScore !== null && s.match.homeScore > s.match.awayScore;
    const awayWon =
      s.match.homeScore !== null && s.match.awayScore !== null && s.match.awayScore > s.match.homeScore;
    const isHome = player.clubId === s.match.homeClubId;
    const teamWon = isHome ? homeWon : awayWon;

    const pts = s.played
      ? computePlayerPoints(
          { lnhRating: s.lnhRating ? Number(s.lnhRating) : null, played: s.played, role: "STARTER", teamWon },
          scoringConfig
        )
      : null;

    return {
      id: s.id,
      gameweekNumber: s.match.gameweek.number,
      opponent: isHome ? s.match.awayClub.shortName : s.match.homeClub.shortName,
      lnhRating: s.lnhRating ? Number(s.lnhRating) : null,
      played: s.played,
      pts,
    };
  });

  const ratedStats = matchLog.filter((s) => s.lnhRating !== null);
  const avgRating =
    ratedStats.length > 0 ? ratedStats.reduce((sum, s) => sum + (s.lnhRating ?? 0), 0) / ratedStats.length : null;

  // Stats saison cumulées — même piège que GET /api/stats/leaders : shotPercentage
  // est un ratio (sum(goals)/sum(shots)), pas une moyenne de pourcentages par match.
  const seasonStatTotals = STAT_LINES.filter((line) => line.key !== "shotPercentage").map((line) => {
    const key = line.key as keyof (typeof revealedStats)[number];
    const total = revealedStats.reduce((sum, s) => sum + (Number(s[key] ?? 0) || 0), 0);
    return { ...line, total };
  });
  const totalGoals = revealedStats.reduce((sum, s) => sum + (s.goalsTotal ?? 0), 0);
  const totalShots = revealedStats.reduce((sum, s) => sum + (s.shotsTotal ?? 0), 0);
  const seasonShotPercentage = totalShots > 0 ? Math.round((totalGoals / totalShots) * 1000) / 10 : null;
  const hasSeasonStats = seasonStatTotals.some((s) => s.total > 0) || seasonShotPercentage !== null;

  return {
    id: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    position: player.position as Position,
    photoUrl: player.photoUrl,
    club: {
      id: player.club.id,
      name: player.club.name,
      shortName: player.club.shortName,
      logoUrl: player.club.logoUrl,
    },
    marketValue: Number(player.marketValue),
    seasonId: player.seasonId,
    seasonLabel: player.season.label,
    isSimulation,
    avgRating,
    seasonStatTotals,
    seasonShotPercentage,
    hasSeasonStats,
    chartEntries: buildPlayerStatsChartEntries(revealedStats, player.clubId),
    valueHistoryPoints: revealedValueHistory.map((h) => ({
      value: Number(h.value),
      gameweekNumber: h.gameweek?.number ?? null,
    })),
    lnhSeasonStats: player.lnhSeasonStats.map((s) => ({
      id: s.id,
      seasonLabel: s.seasonLabel,
      matchesPlayed: s.matchesPlayed,
      avgLnhScore: Number(s.avgLnhScore),
    })),
    matchLog,
  };
}
