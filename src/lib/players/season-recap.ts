// Récap "chiffres clés" de la saison 2025/2026 pour un joueur de la saison
// live 2026/27 — utilisé par le popup au survol pendant la construction
// d'effectif (BuildView). Player est dupliqué par saison
// (@@unique([seasonId, clubId, firstName, lastName])), donc pas de FK stable
// entre les deux lignes : on retrouve l'archive par nom(+club), même logique
// que matchPlayerSeasonScores (src/lib/players/lnh-score-matching.ts). Club
// est global (non scopé par saison) donc clubId reste stable d'une saison à
// l'autre pour un même club, sauf transfert.
import { prisma } from "@/lib/db";
import { SIMULATION_SEASON_LABEL } from "@/lib/simulation/constants";

export interface PlayerSeasonRecap {
  seasonLabel: string;
  matchesPlayed: number;
  avgRating: number | null;
  goalsTotal: number | null;
  assists: number | null;
  saves: number | null;
  savePercentage: number | null;
}

async function findArchivedPlayerId(
  ref: { firstName: string; lastName: string; clubId: string },
  archivedSeasonId: string
): Promise<string | null> {
  const sameClub = await prisma.player.findFirst({
    where: {
      seasonId: archivedSeasonId,
      clubId: ref.clubId,
      firstName: { equals: ref.firstName, mode: "insensitive" },
      lastName: { equals: ref.lastName, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (sameClub) return sameClub.id;

  // Transfert entre les deux saisons : fallback nom seul, seulement si non ambigu.
  const byName = await prisma.player.findMany({
    where: {
      seasonId: archivedSeasonId,
      firstName: { equals: ref.firstName, mode: "insensitive" },
      lastName: { equals: ref.lastName, mode: "insensitive" },
    },
    select: { id: true },
  });
  return byName.length === 1 ? byName[0]!.id : null;
}

export async function getPreviousSeasonRecap(playerId: string): Promise<PlayerSeasonRecap | null> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      firstName: true,
      lastName: true,
      clubId: true,
      position: true,
      season: { select: { label: true } },
    },
  });
  // Pas de "saison précédente" si le joueur est déjà celui de 2025/2026 (mode simulation).
  if (!player || player.season.label === SIMULATION_SEASON_LABEL) return null;

  const archivedSeason = await prisma.season.findUnique({
    where: { label: SIMULATION_SEASON_LABEL },
    select: { id: true },
  });
  if (!archivedSeason) return null;

  const archivedPlayerId = await findArchivedPlayerId(player, archivedSeason.id);
  if (!archivedPlayerId) return null;

  const agg = await prisma.playerMatchStat.aggregate({
    where: { playerId: archivedPlayerId, played: true },
    _count: { _all: true },
    _avg: { lnhRating: true },
    _sum: { goalsTotal: true, assists: true, saves: true, shotsFaced: true },
  });
  if (agg._count._all === 0) return null;

  const isGoalkeeper = player.position === "GK";
  const saves = agg._sum.saves;
  const shotsFaced = agg._sum.shotsFaced;
  const matchesPlayed = agg._count._all;

  return {
    seasonLabel: "2025/2026",
    matchesPlayed,
    avgRating: agg._avg.lnhRating !== null ? Math.round(Number(agg._avg.lnhRating) * 10) / 10 : null,
    goalsTotal: isGoalkeeper ? null : agg._sum.goalsTotal ?? 0,
    assists: isGoalkeeper ? null : agg._sum.assists ?? 0,
    saves: isGoalkeeper ? saves ?? 0 : null,
    // Ratio des sommes (comme seasonShotPercentage dans player-detail.ts), pas une
    // moyenne des % match par match.
    savePercentage:
      isGoalkeeper && saves !== null && shotsFaced ? Math.round((saves / shotsFaced) * 1000) / 10 : null,
  };
}
