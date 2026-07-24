// Mes équipes (toutes ligues confondues) pour le mode courant, avec les joueurs
// que chacune possède — utilisé pour surligner "je le possède déjà" dans les
// widgets qui listent des joueurs (ex. StatLeaderCard), sans dupliquer la requête
// à chaque widget. Contrairement à resolveActiveTeamContext (UNE équipe "active"),
// on veut ici TOUTES les équipes de l'utilisateur : un joueur peut être dans
// l'effectif d'une ligue mais pas d'une autre.
import { prisma } from "@/lib/db";
import type { SeasonMode } from "./active-team-context";
import { resolveModeSeason } from "./active-team-context";

export interface MyTeamOwnership {
  teamId: string;
  teamName: string;
  leagueId: string;
  leagueName: string;
  playerIds: string[];
}

export async function getMyTeamsOwnership(userId: string, mode: SeasonMode): Promise<MyTeamOwnership[]> {
  const season = await resolveModeSeason(mode);
  if (!season) return [];

  if (mode === "simulation") {
    const teams = await prisma.simulationTeam.findMany({
      where: { userId, seasonId: season.id },
      include: {
        league: { select: { id: true, name: true } },
        squad: { select: { playerId: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return teams.map((t) => ({
      teamId: t.id,
      teamName: t.name,
      leagueId: t.leagueId,
      leagueName: t.league.name,
      playerIds: t.squad.map((s) => s.playerId),
    }));
  }

  const teams = await prisma.fantasyTeam.findMany({
    where: { userId, league: { seasonId: season.id } },
    include: {
      league: { select: { id: true, name: true } },
      squad: { select: { playerId: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return teams.map((t) => ({
    teamId: t.id,
    teamName: t.name,
    leagueId: t.leagueId,
    leagueName: t.league.name,
    playerIds: t.squad.map((s) => s.playerId),
  }));
}
