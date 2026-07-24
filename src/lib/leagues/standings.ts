// Classement de ligue équipe-first (une FantasyTeam/SimulationTeam par (userId,
// leagueId)) — factorisé entre les pages et les API de détail de ligue. Le "mode"
// (live/simulation) d'une League se déduit de sa saison (league.season.label ===
// SIMULATION_SEASON_LABEL), jamais passé en paramètre séparé — voir plan de
// fusion live/simulation, étape 5.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SIMULATION_SEASON_LABEL } from "@/lib/simulation/constants";
import type { SeasonMode } from "@/lib/team/active-team-context";

export interface LeagueStandingEntry {
  teamId: string;
  userId: string;
  userName: string;
  teamName: string;
  totalPoints: number;
  jerseyConfig: unknown;
  rank: number;
}

export interface LeagueDetail {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  maxMembers: number;
  memberCount: number;
  seasonId: string;
  mode: SeasonMode;
  standings: LeagueStandingEntry[];
}

export async function getLeagueDetail(leagueId: string): Promise<LeagueDetail | null> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      name: true,
      ownerId: true,
      inviteCode: true,
      maxMembers: true,
      seasonId: true,
      season: { select: { label: true } },
    },
  });
  if (!league) return null;

  const mode: SeasonMode = league.season.label === SIMULATION_SEASON_LABEL ? "simulation" : "live";

  const [teams, memberCount] = await Promise.all([
    mode === "simulation"
      ? prisma.simulationTeam.findMany({
          where: { leagueId },
          orderBy: [{ totalPoints: "desc" }, { createdAt: "asc" }],
          select: { id: true, name: true, totalPoints: true, userId: true, user: { select: { name: true } } },
        })
      : prisma.fantasyTeam.findMany({
          where: { leagueId },
          orderBy: [{ totalPoints: "desc" }, { createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            totalPoints: true,
            jerseyConfig: true,
            userId: true,
            user: { select: { name: true } },
          },
        }),
    prisma.leagueMember.count({ where: { leagueId } }),
  ]);

  const standings: LeagueStandingEntry[] = teams.map((t, i) => ({
    teamId: t.id,
    userId: t.userId,
    userName: t.user.name,
    teamName: t.name,
    totalPoints: Number(t.totalPoints),
    jerseyConfig: "jerseyConfig" in t ? t.jerseyConfig : null,
    rank: i + 1,
  }));

  return {
    id: league.id,
    name: league.name,
    ownerId: league.ownerId,
    inviteCode: league.inviteCode,
    maxMembers: league.maxMembers,
    seasonId: league.seasonId,
    mode,
    memberCount,
    standings,
  };
}

export async function isLeagueMember(leagueId: string, userId: string): Promise<boolean> {
  const member = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
    select: { leagueId: true },
  });
  return member !== null;
}

// Supprime, pour un ensemble d'équipes d'une ligue LIVE, tout ce qui référence
// fantasyTeamId avant de pouvoir supprimer les équipes elles-mêmes (Prisma ne
// cascade pas ces relations — voir prisma/schema.prisma). Utilisé à la fois pour
// "quitter une ligue" (une équipe) et "supprimer une ligue" (toutes les équipes).
export async function deleteTeamsCascade(
  tx: Prisma.TransactionClient,
  fantasyTeamIds: string[]
): Promise<void> {
  if (fantasyTeamIds.length === 0) return;
  await tx.fantasyLineup.deleteMany({ where: { fantasyTeamId: { in: fantasyTeamIds } } });
  await tx.fantasySquadPlayer.deleteMany({ where: { fantasyTeamId: { in: fantasyTeamIds } } });
  await tx.fantasyTeam.deleteMany({ where: { id: { in: fantasyTeamIds } } });
}

// Équivalent simulation de deleteTeamsCascade.
export async function deleteSimulationTeamsCascade(
  tx: Prisma.TransactionClient,
  simulationTeamIds: string[]
): Promise<void> {
  if (simulationTeamIds.length === 0) return;
  await tx.simulationLineup.deleteMany({ where: { simulationTeamId: { in: simulationTeamIds } } });
  await tx.simulationSquadPlayer.deleteMany({ where: { simulationTeamId: { in: simulationTeamIds } } });
  await tx.simulationTeam.deleteMany({ where: { id: { in: simulationTeamIds } } });
}
