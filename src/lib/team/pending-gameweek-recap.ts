// Récap "combien de points as-tu marqué cette journée ?" affiché sur le dashboard
// à la prochaine visite suivant une journée notée — voir GameweekRecapModal.
//
// Un utilisateur peut avoir plusieurs équipes (une par ligue, §2.5), et une équipe
// est ratée à chaque journée notée AU PLUS UNE fois — pas de backlog empilé si
// l'utilisateur revient après plusieurs journées : on ne montre que la dernière
// journée notée, et on marque l'équipe "vue" jusque-là (pas de rattrapage
// rétroactif journée par journée, ça flooderait un retour après une pause).
//
// Live et Simulation divergent sur la définition de "dernière journée notée" :
// - Live : Gameweek.isScored est global pour la saison (toutes les équipes sont
//   scorées ensemble par compute-scores) → une seule requête pour la journée.
// - Simulation : chaque équipe avance à son rythme (curseur admin par équipe via
//   SimulationLineup.points, pas Gameweek.isScored — même piège que documenté
//   dans team/history/[gameweekId]/page.tsx) → on lit le lineup scoré le plus
//   récent de CHAQUE équipe individuellement.
//
// v2 (ARCHITECTURE.md §24) : chaque récap est enrichi avec le détail par joueur
// (getGameweekLineupDetail), le meilleur titulaire de la journée et l'évolution du
// rang au classement général (getRankMovement — null si le snapshot n'existe pas
// encore, ex. 1ʳᵉ journée ou backfill prod pas encore lancé).
import { prisma } from "@/lib/db";
import type { SeasonMode } from "@/lib/team/active-team-context";
import {
  getGameweekLineupDetail,
  pickTopPerformer,
  type LineupPlayerDetail,
} from "@/lib/team/gameweek-lineup-detail";
import { getRankMovement, type RankMovement } from "@/lib/standings/get-rank-movement";

export interface PendingGameweekRecap {
  mode: SeasonMode;
  teamId: string;
  teamName: string;
  leagueId: string;
  leagueName: string;
  gameweekId: string;
  gameweekNumber: number;
  points: number;
  players: LineupPlayerDetail[];
  topPerformer: LineupPlayerDetail | null;
  rank: RankMovement | null;
}

interface BaseRecap {
  mode: SeasonMode;
  teamId: string;
  teamName: string;
  leagueId: string;
  leagueName: string;
  gameweekId: string;
  gameweekNumber: number;
  points: number;
}

export async function getPendingGameweekRecaps(
  userId: string,
  mode: SeasonMode,
  seasonId: string
): Promise<PendingGameweekRecap[]> {
  const base =
    mode === "simulation"
      ? await getSimulationPendingRecaps(userId, seasonId)
      : await getLivePendingRecaps(userId, seasonId);

  const snapshotMode = mode === "simulation" ? "SIMULATION" : "LIVE";

  return Promise.all(
    base.map(async (r): Promise<PendingGameweekRecap> => {
      const [detail, rank] = await Promise.all([
        getGameweekLineupDetail(mode, r.teamId, r.gameweekId),
        getRankMovement(seasonId, snapshotMode, r.teamId, r.gameweekNumber),
      ]);
      return {
        ...r,
        players: detail?.players ?? [],
        topPerformer: detail ? pickTopPerformer(detail) : null,
        rank,
      };
    })
  );
}

async function getLivePendingRecaps(userId: string, seasonId: string): Promise<BaseRecap[]> {
  const latestScored = await prisma.gameweek.findFirst({
    where: { seasonId, isScored: true },
    orderBy: { number: "desc" },
  });
  if (!latestScored) return [];

  const teams = await prisma.fantasyTeam.findMany({
    where: {
      userId,
      isValidated: true,
      lastPointsSeenGameweekNumber: { lt: latestScored.number },
      league: { seasonId },
    },
    include: {
      league: { select: { id: true, name: true } },
      lineups: { where: { gameweekId: latestScored.id }, select: { points: true } },
    },
  });

  const recaps: BaseRecap[] = [];
  for (const team of teams) {
    const points = team.lineups[0]?.points;
    if (points === undefined || points === null) continue;
    recaps.push({
      mode: "live",
      teamId: team.id,
      teamName: team.name,
      leagueId: team.league.id,
      leagueName: team.league.name,
      gameweekId: latestScored.id,
      gameweekNumber: latestScored.number,
      points: Number(points),
    });
  }
  return recaps;
}

async function getSimulationPendingRecaps(userId: string, seasonId: string): Promise<BaseRecap[]> {
  const teams = await prisma.simulationTeam.findMany({
    where: { userId, isValidated: true, seasonId },
    include: {
      league: { select: { id: true, name: true } },
      lineups: {
        where: { points: { not: null } },
        orderBy: { gameweek: { number: "desc" } },
        take: 1,
        include: { gameweek: { select: { id: true, number: true } } },
      },
    },
  });

  const recaps: BaseRecap[] = [];
  for (const team of teams) {
    const latestScoredLineup = team.lineups[0];
    if (!latestScoredLineup || latestScoredLineup.points === null) continue;
    if (latestScoredLineup.gameweek.number <= team.lastPointsSeenGameweekNumber) continue;
    recaps.push({
      mode: "simulation",
      teamId: team.id,
      teamName: team.name,
      leagueId: team.league.id,
      leagueName: team.league.name,
      gameweekId: latestScoredLineup.gameweek.id,
      gameweekNumber: latestScoredLineup.gameweek.number,
      points: Number(latestScoredLineup.points),
    });
  }
  return recaps;
}
