// Détail du classement général (ARCHITECTURE.md §14) : décompose le total de
// chaque journée notée d'une équipe LIVE en points d'effectif (rawPoints) et
// apport net des pronostics (points - rawPoints, via predictionDeltaPoints).
// LIVE uniquement — le Mode Simulation n'a pas de pronostics (voir
// compute.simulation.ts, aucun multiplicateur appliqué), donc pas de FantasyTeam
// équivalent côté SimulationTeam ici.
import { prisma } from "@/lib/db";
import { predictionDeltaPoints } from "@/lib/predictions/multiplier";
import { computePlayerPoints, parseScoringConfig } from "@/lib/scoring/engine";
import type { BonusType, Position } from "@prisma/client";

export interface TeamGameweekBreakdownRow {
  gameweekId: string;
  gameweekNumber: number;
  points: number;
  // null tant que la journée n'a pas encore été (re)notée depuis l'introduction de
  // ce détail — voir scripts/backfill-lineup-prediction-breakdown.ts.
  rawPoints: number | null;
  predictionMultiplier: number | null;
  predictionDelta: number | null;
  bonus: BonusType | null;
}

export interface TeamBreakdownResult {
  teamId: string;
  teamName: string;
  userName: string;
  jerseyConfig: unknown;
  totalPoints: number;
  rank: number | null;
  gameweeks: TeamGameweekBreakdownRow[];
}

export async function getFantasyTeamBreakdown(teamId: string): Promise<TeamBreakdownResult | null> {
  const team = await prisma.fantasyTeam.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      totalPoints: true,
      jerseyConfig: true,
      isValidated: true,
      user: { select: { name: true } },
      lineups: {
        where: { points: { not: null } },
        orderBy: { gameweek: { number: "asc" } },
        select: {
          points: true,
          rawPoints: true,
          predictionMultiplier: true,
          bonus: true,
          gameweekId: true,
          gameweek: { select: { number: true } },
        },
      },
    },
  });
  if (!team) return null;

  const rank = team.isValidated
    ? (await prisma.fantasyTeam.count({
        where: { isValidated: true, totalPoints: { gt: team.totalPoints } },
      })) + 1
    : null;

  return {
    teamId: team.id,
    teamName: team.name,
    userName: team.user.name,
    jerseyConfig: team.jerseyConfig,
    totalPoints: Number(team.totalPoints),
    rank,
    gameweeks: team.lineups.map((l) => {
      const points = Number(l.points);
      const rawPoints = l.rawPoints !== null ? Number(l.rawPoints) : null;
      return {
        gameweekId: l.gameweekId,
        gameweekNumber: l.gameweek.number,
        points,
        rawPoints,
        predictionMultiplier: l.predictionMultiplier !== null ? Number(l.predictionMultiplier) : null,
        predictionDelta: rawPoints !== null ? predictionDeltaPoints(rawPoints, points) : null,
        bonus: l.bonus,
      };
    }),
  };
}

export interface LastGameweekBreakdown {
  gameweekNumber: number;
  rawPoints: number;
  predictionDelta: number;
}

/**
 * Dernière journée notée (avec détail persisté) pour un lot d'équipes — utilisé
 * pour l'aperçu "sans clic" affiché directement dans les listes (widget dashboard,
 * classement général, classement de ligue). Une entrée manquante dans la map
 * retournée signifie "pas encore de détail disponible" (jamais noté, ou noté
 * avant l'introduction de ce détail — voir scripts/backfill-lineup-prediction-breakdown.ts).
 */
export async function getLastGameweekBreakdownByTeam(
  teamIds: string[]
): Promise<Map<string, LastGameweekBreakdown>> {
  const result = new Map<string, LastGameweekBreakdown>();
  if (teamIds.length === 0) return result;

  const latestLineups = await prisma.fantasyLineup.findMany({
    where: { fantasyTeamId: { in: teamIds }, points: { not: null } },
    orderBy: { gameweek: { number: "desc" } },
    distinct: ["fantasyTeamId"],
    select: { fantasyTeamId: true, points: true, rawPoints: true, gameweek: { select: { number: true } } },
  });

  for (const l of latestLineups) {
    if (l.rawPoints === null) continue;
    const rawPoints = Number(l.rawPoints);
    result.set(l.fantasyTeamId, {
      gameweekNumber: l.gameweek.number,
      rawPoints,
      predictionDelta: predictionDeltaPoints(rawPoints, Number(l.points)),
    });
  }
  return result;
}

export interface LineupPlayerBreakdownRow {
  playerId: string;
  firstName: string;
  lastName: string;
  position: Position;
  photoUrl: string | null;
  clubShortName: string;
  clubLogoUrl: string | null;
  role: "STARTER" | "BENCH";
  isCaptain: boolean;
  lnhRating: number | null;
  played: boolean;
  points: number;
}

interface SnapshotEntry {
  playerId: string;
  position: string;
  role: "STARTER" | "BENCH";
  purchasePrice: number;
  isCaptain?: boolean;
}

/**
 * Détail joueur par joueur d'un lineup déjà scoré — "descendre au niveau
 * joueur" du classement (quel joueur a rapporté combien de points cette
 * journée-là), pas seulement l'agrégat effectif vs pronostics. Même calcul que
 * la page "mon équipe" (team/history/[gameweekId]), mais paramétré par équipe
 * plutôt que déduit de la session — n'importe quelle équipe LIVE déjà notée,
 * pas seulement la sienne (composition publique après coup, jamais avant la
 * deadline puisqu'on ne l'expose que pour un lineup avec points non nuls).
 */
export async function getFantasyLineupPlayerBreakdown(
  fantasyTeamId: string,
  gameweekId: string
): Promise<LineupPlayerBreakdownRow[] | null> {
  const lineup = await prisma.fantasyLineup.findUnique({
    where: { fantasyTeamId_gameweekId: { fantasyTeamId, gameweekId } },
    select: { entries: true, points: true },
  });
  if (!lineup || lineup.points === null) return null;

  const entries = lineup.entries as unknown as SnapshotEntry[];
  const playerIds = entries.map((e) => e.playerId);

  const [players, rawStats, configs] = await Promise.all([
    prisma.player.findMany({
      where: { id: { in: playerIds } },
      include: { club: { select: { shortName: true, logoUrl: true } } },
    }),
    prisma.playerMatchStat.findMany({
      where: { playerId: { in: playerIds }, match: { gameweekId } },
      include: {
        match: { select: { homeClubId: true, awayClubId: true, homeScore: true, awayScore: true } },
        player: { select: { clubId: true } },
      },
    }),
    prisma.gameConfig.findMany(),
  ]);

  const playerMap = new Map(players.map((p) => [p.id, p]));
  const scoringConfig = parseScoringConfig(Object.fromEntries(configs.map((c) => [c.key, c.value])));

  const statMap = new Map<string, { lnhRating: number | null; played: boolean; teamWon: boolean }>();
  for (const stat of rawStats) {
    const homeWon =
      stat.match.homeScore !== null && stat.match.awayScore !== null && stat.match.homeScore > stat.match.awayScore;
    const awayWon =
      stat.match.homeScore !== null && stat.match.awayScore !== null && stat.match.awayScore > stat.match.homeScore;
    const isHome = stat.player.clubId === stat.match.homeClubId;
    statMap.set(stat.playerId, {
      lnhRating: stat.lnhRating !== null ? Number(stat.lnhRating) : null,
      played: stat.played,
      teamWon: isHome ? homeWon : awayWon,
    });
  }

  return entries
    .map((e) => {
      const p = playerMap.get(e.playerId);
      if (!p) return null;
      const stat = statMap.get(e.playerId);
      const points = computePlayerPoints(
        {
          lnhRating: stat?.lnhRating ?? null,
          played: stat?.played ?? false,
          role: e.role,
          teamWon: stat?.teamWon ?? false,
        },
        scoringConfig
      );
      return {
        playerId: e.playerId,
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position,
        photoUrl: p.photoUrl,
        clubShortName: p.club.shortName,
        clubLogoUrl: p.club.logoUrl,
        role: e.role,
        isCaptain: e.isCaptain ?? false,
        lnhRating: stat?.lnhRating ?? null,
        played: stat?.played ?? false,
        points,
      };
    })
    .filter((r): r is LineupPlayerBreakdownRow => r !== null)
    .sort((a, b) => (a.role === b.role ? 0 : a.role === "STARTER" ? -1 : 1));
}
