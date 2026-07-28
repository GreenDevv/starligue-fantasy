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
import { findArchivedPlayerId } from "./season-recap";
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
  photoOffsetX: number;
  photoOffsetY: number;
  photoZoom: number;
  club: { id: string; name: string; shortName: string; logoUrl: string | null };
  marketValue: number;
  seasonId: string;
  seasonLabel: string;
  isSimulation: boolean;
  // true si les champs stats ci-dessous viennent de la saison précédente
  // (2025/2026) faute de stats sur la saison courante. `club` reste TOUJOURS le
  // club actuel du joueur (jamais écrasé) — `statsClub` porte le club du joueur
  // PENDANT la saison archivée (peut différer si transfert entretemps), à
  // afficher uniquement à côté du bloc de stats de repli, pas dans l'en-tête.
  isFallbackSeason: boolean;
  statsClub: { id: string; name: string; shortName: string; logoUrl: string | null } | null;
  statsSeasonLabel: string;
  avgRating: number | null;
  seasonStatTotals: { key: string; category: "bonus" | "malus"; total: number }[];
  seasonShotPercentage: number | null;
  hasSeasonStats: boolean;
  chartEntries: PlayerStatsChartEntry[];
  valueHistoryPoints: { value: number; gameweekNumber: number | null }[];
  lnhSeasonStats: { id: string; seasonLabel: string; matchesPlayed: number; avgLnhScore: number }[];
  matchLog: PlayerDetailMatchLogEntry[];
}

const STATS_INCLUDE = {
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
    orderBy: { match: { kickoffAt: "desc" as const } },
  },
};

type StatsRow = Awaited<ReturnType<typeof prisma.player.findFirstOrThrow<{ include: typeof STATS_INCLUDE }>>>["stats"][number];

interface StatsBlock {
  matchLog: PlayerDetailMatchLogEntry[];
  avgRating: number | null;
  seasonStatTotals: { key: string; category: "bonus" | "malus"; total: number }[];
  seasonShotPercentage: number | null;
  hasSeasonStats: boolean;
  chartEntries: PlayerStatsChartEntry[];
}

// Pure (à isRevealed/scoringConfig/stats/clubId près) — réutilisée pour le joueur
// de la saison courante ET, en repli, pour l'archive de la saison précédente.
function computeStatsBlock(
  stats: StatsRow[],
  clubId: string,
  scoringConfig: ReturnType<typeof parseScoringConfig>,
  isRevealed: (gameweekNumber: number) => boolean
): StatsBlock {
  const revealedStats = stats.filter((s) => isRevealed(s.match.gameweek.number));

  const matchLog: PlayerDetailMatchLogEntry[] = revealedStats.map((s) => {
    const homeWon =
      s.match.homeScore !== null && s.match.awayScore !== null && s.match.homeScore > s.match.awayScore;
    const awayWon =
      s.match.homeScore !== null && s.match.awayScore !== null && s.match.awayScore > s.match.homeScore;
    const isHome = clubId === s.match.homeClubId;
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
    return { key: line.key, category: line.category, total };
  });
  const totalGoals = revealedStats.reduce((sum, s) => sum + (s.goalsTotal ?? 0), 0);
  const totalShots = revealedStats.reduce((sum, s) => sum + (s.shotsTotal ?? 0), 0);
  const seasonShotPercentage = totalShots > 0 ? Math.round((totalGoals / totalShots) * 1000) / 10 : null;
  const hasSeasonStats = seasonStatTotals.some((s) => s.total > 0) || seasonShotPercentage !== null;

  return {
    matchLog,
    avgRating,
    seasonStatTotals,
    seasonShotPercentage,
    hasSeasonStats,
    chartEntries: buildPlayerStatsChartEntries(revealedStats, clubId),
  };
}

export async function getPlayerDetailData(playerId: string): Promise<PlayerDetailData | null> {
  const [player, configs] = await Promise.all([
    prisma.player.findUnique({
      where: { id: playerId },
      include: {
        club: true,
        season: { select: { label: true } },
        ...STATS_INCLUDE,
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

  const revealedValueHistory = player.valueHistory.filter(
    (h) => h.gameweek === null || isRevealed(h.gameweek.number)
  );

  const scoringConfig = parseScoringConfig(Object.fromEntries(configs.map((c) => [c.key, c.value])));

  let statsBlock = computeStatsBlock(player.stats, player.clubId, scoringConfig, isRevealed);
  let isFallbackSeason = false;
  let statsClub: PlayerDetailData["statsClub"] = null;
  let statsSeasonLabel = player.season.label;

  // Saison courante fraîchement démarrée, pas encore de notes/stats importées :
  // on retombe sur les stats 2025/2026 du même joueur si on peut le retrouver
  // dans l'archive (nom + club, fallback nom seul si transfert et non ambigu —
  // même logique que getPreviousSeasonRecap). Jamais de repli si le joueur
  // consulté est déjà celui de la saison archive elle-même (mode simulation).
  if (!statsBlock.hasSeasonStats && !isSimulation) {
    const archivedSeason = await prisma.season.findUnique({
      where: { label: SIMULATION_SEASON_LABEL },
      select: { id: true, label: true },
    });

    if (archivedSeason) {
      const archivedPlayerId = await findArchivedPlayerId(player, archivedSeason.id);
      if (archivedPlayerId) {
        const archivedPlayer = await prisma.player.findUnique({
          where: { id: archivedPlayerId },
          include: { club: true, ...STATS_INCLUDE },
        });

        if (archivedPlayer) {
          // Saison archivée déjà entièrement terminée et publique — aucun
          // curseur anti-spoiler à appliquer ici (celui-ci ne concerne que les
          // joueurs *actuellement* rattachés à la saison simulation, §ci-dessus).
          const archivedBlock = computeStatsBlock(
            archivedPlayer.stats,
            archivedPlayer.clubId,
            scoringConfig,
            () => true
          );
          if (archivedBlock.hasSeasonStats) {
            statsBlock = archivedBlock;
            statsClub = {
              id: archivedPlayer.club.id,
              name: archivedPlayer.club.name,
              shortName: archivedPlayer.club.shortName,
              logoUrl: archivedPlayer.club.logoUrl,
            };
            isFallbackSeason = true;
            statsSeasonLabel = archivedSeason.label;
          }
        }
      }
    }
  }

  return {
    id: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    position: player.position as Position,
    photoUrl: player.photoUrl,
    photoOffsetX: player.photoOffsetX,
    photoOffsetY: player.photoOffsetY,
    photoZoom: Number(player.photoZoom),
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
    isFallbackSeason,
    statsClub,
    statsSeasonLabel,
    avgRating: statsBlock.avgRating,
    seasonStatTotals: statsBlock.seasonStatTotals,
    seasonShotPercentage: statsBlock.seasonShotPercentage,
    hasSeasonStats: statsBlock.hasSeasonStats,
    chartEntries: statsBlock.chartEntries,
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
    matchLog: statsBlock.matchLog,
  };
}
