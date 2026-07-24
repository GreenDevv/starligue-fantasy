// Résolution du "mode de saison" courant (live 26/27 vs Simulation 25/26) —
// même convention de cookie httpOnly que src/lib/team/active-league.ts
// (ACTIVE_LEAGUE_COOKIE) : jamais fait confiance aveuglément côté valeur (un enum
// à 2 valeurs n'a pas besoin de revérification DB, contrairement à un leagueId).
// Voir memory "live-simulation-merge-plan" pour le plan de fusion complet.
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveActiveLeagueId } from "@/lib/team/active-league";
import { SIMULATION_SEASON_LABEL } from "@/lib/simulation/constants";

export type SeasonMode = "live" | "simulation";

export const SEASON_MODE_COOKIE = "seasonMode";

export function resolveSeasonMode(): SeasonMode {
  const value = cookies().get(SEASON_MODE_COOKIE)?.value;
  return value === "simulation" ? "simulation" : "live";
}

export function setSeasonModeCookie(response: NextResponse, mode: SeasonMode) {
  response.cookies.set(SEASON_MODE_COOKIE, mode, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function resolveModeSeason(mode: SeasonMode) {
  return mode === "simulation"
    ? prisma.season.findUnique({ where: { label: SIMULATION_SEASON_LABEL } })
    : prisma.season.findFirst({ where: { isActive: true } });
}

export interface ActiveTeamContext {
  mode: SeasonMode;
  seasonId: string;
  leagueId: string;
  teamId: string;
}

// Résout "l'équipe active" de l'utilisateur pour le mode donné : saison → ligue
// (resolveActiveLeagueId, scopée par seasonId pour ne jamais mélanger une ligue
// live et une ligue de simulation) → FantasyTeam/SimulationTeam de cette ligue.
// null si l'utilisateur n'a encore aucune ligue dans ce mode (pas encore
// commencé/rejoint).
export async function resolveActiveTeamContext(
  userId: string,
  mode: SeasonMode,
  explicitLeagueId?: string | null
): Promise<ActiveTeamContext | null> {
  const season = await resolveModeSeason(mode);
  if (!season) return null;

  const leagueId = await resolveActiveLeagueId(userId, explicitLeagueId, season.id);
  if (!leagueId) return null;

  const team =
    mode === "simulation"
      ? await prisma.simulationTeam.findFirst({ where: { userId, leagueId }, select: { id: true } })
      : await prisma.fantasyTeam.findFirst({ where: { userId, leagueId }, select: { id: true } });
  if (!team) return null;

  return { mode, seasonId: season.id, leagueId, teamId: team.id };
}
