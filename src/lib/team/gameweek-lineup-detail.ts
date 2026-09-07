// Détail d'un alignement pour une journée : points par joueur (titulaires + banc),
// note LNH, capitaine. Source unique partagée par la page /team/history/[gameweekId]
// et le récap de journée enrichi (GameweekRecapModal + /api/og/gameweek-recap).
//
// Points par joueur = points BRUTS d'effectif : baseline × multiplier, ×0,5 banc,
// ×2 capitaine titulaire. N'inclut PAS le bonus/malus "leader de journée"
// (src/lib/scoring/stat-leaders.ts) ni le multiplicateur de pronostics — donc la
// somme des lignes peut légèrement différer du total officiel (`lineup.points`,
// toujours affiché comme référence). Voir ARCHITECTURE.md §2.3 / §14.
import { prisma } from "@/lib/db";
import { computePlayerPoints, parseScoringConfig } from "@/lib/scoring/engine";
import type { SeasonMode } from "@/lib/team/active-team-context";
import type { Position } from "@/lib/squad/validation";
import type { BonusType } from "@prisma/client";

interface SnapshotEntry {
  playerId: string;
  position: string;
  role: "STARTER" | "BENCH";
  purchasePrice: number;
  isCaptain?: boolean; // snapshoté au verrouillage — capitaine DE CETTE JOURNÉE (§13.4)
}

export interface LineupPlayerDetail {
  playerId: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  position: Position;
  role: "STARTER" | "BENCH";
  club: { shortName: string; logoUrl: string | null };
  isCaptain: boolean;
  lnhRating: number | null;
  points: number | null; // null tant que la journée n'est pas notée
}

export interface GameweekLineupDetail {
  gameweekId: string;
  gameweekNumber: number;
  isScored: boolean;
  totalPoints: number | null;
  bonus: BonusType | null;
  players: LineupPlayerDetail[]; // titulaires d'abord, puis banc
}

export async function getGameweekLineupDetail(
  mode: SeasonMode,
  teamId: string,
  gameweekId: string,
  // includePartialStats : calcule les points depuis les PlayerMatchStat DÉJÀ
  // présents même si la journée n'est pas notée (score provisoire, voir
  // getLiveGameweekScore). `isScored` dans le retour reste le vrai état.
  opts: { includePartialStats?: boolean } = {}
): Promise<GameweekLineupDetail | null> {
  const lineup =
    mode === "simulation"
      ? await prisma.simulationLineup.findUnique({
          where: { simulationTeamId_gameweekId: { simulationTeamId: teamId, gameweekId } },
          include: { gameweek: { select: { number: true, isScored: true } } },
        })
      : await prisma.fantasyLineup.findUnique({
          where: { fantasyTeamId_gameweekId: { fantasyTeamId: teamId, gameweekId } },
          include: { gameweek: { select: { number: true, isScored: true } } },
        });

  if (!lineup) return null;

  // Simulation : "scored" = ce lineup a des points (chaque équipe avance à son
  // rythme). Live : Gameweek.isScored (global saison).
  const isScored = mode === "simulation" ? lineup.points !== null : lineup.gameweek.isScored;
  const scoreFromStats = isScored || opts.includePartialStats === true;

  const entries = lineup.entries as unknown as SnapshotEntry[];
  const playerIds = entries.map((e) => e.playerId);

  const [players, rawStats, configs] = await Promise.all([
    prisma.player.findMany({
      where: { id: { in: playerIds } },
      include: { club: { select: { shortName: true, logoUrl: true } } },
    }),
    scoreFromStats
      ? prisma.playerMatchStat.findMany({
          where: { playerId: { in: playerIds }, match: { gameweekId } },
          include: {
            match: { select: { homeClubId: true, awayClubId: true, homeScore: true, awayScore: true } },
            player: { select: { clubId: true } },
          },
        })
      : Promise.resolve([]),
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

  const detail = entries.map((e): LineupPlayerDetail => {
    const p = playerMap.get(e.playerId);
    const stat = statMap.get(e.playerId);
    // Provisoire (includePartialStats) : un joueur dont le match n'a pas encore de
    // note → points null (pas 0), pour distinguer "0 point" de "pas encore joué".
    // teamWon vient de la note (false tant que le match n'est pas fini) → le bonus
    // de victoire ne s'ajoute qu'une fois le résultat définitif connu.
    const points = stat
      ? computePlayerPoints(
          {
            lnhRating: stat.lnhRating,
            played: stat.played,
            role: e.role,
            teamWon: stat.teamWon,
            isCaptain: e.isCaptain ?? false,
          },
          scoringConfig
        )
      : isScored
        ? 0
        : null;
    return {
      playerId: e.playerId,
      firstName: p?.firstName ?? "",
      lastName: p?.lastName ?? "",
      photoUrl: p?.photoUrl ?? null,
      position: e.position as Position,
      role: e.role,
      club: { shortName: p?.club.shortName ?? "", logoUrl: p?.club.logoUrl ?? null },
      isCaptain: e.isCaptain ?? false,
      lnhRating: stat?.lnhRating ?? null,
      points,
    };
  });

  const players_ = [
    ...detail.filter((d) => d.role === "STARTER"),
    ...detail.filter((d) => d.role === "BENCH"),
  ];

  return {
    gameweekId,
    gameweekNumber: lineup.gameweek.number,
    isScored,
    totalPoints: lineup.points !== null ? Number(lineup.points) : null,
    bonus: lineup.bonus,
    players: players_,
  };
}

// Meilleur titulaire de la journée (points max, doit avoir joué). null si la
// journée n'est pas notée ou si aucun titulaire n'a marqué de points.
export function pickTopPerformer(detail: GameweekLineupDetail): LineupPlayerDetail | null {
  if (!detail.isScored) return null;
  const starters = detail.players.filter((p) => p.role === "STARTER" && p.points !== null);
  if (starters.length === 0) return null;
  const best = starters.reduce((a, b) => ((b.points ?? 0) > (a.points ?? 0) ? b : a));
  return (best.points ?? 0) > 0 ? best : null;
}
