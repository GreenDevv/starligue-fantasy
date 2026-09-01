// Détail du classement général (ARCHITECTURE.md §14) : décompose le total de
// chaque journée notée d'une équipe LIVE en points d'effectif (rawPoints) et
// apport net des pronostics (points - rawPoints, via predictionDeltaPoints).
// LIVE uniquement — le Mode Simulation n'a pas de pronostics (voir
// compute.simulation.ts, aucun multiplicateur appliqué), donc pas de FantasyTeam
// équivalent côté SimulationTeam ici.
import { prisma } from "@/lib/db";
import { predictionDeltaPoints } from "@/lib/predictions/multiplier";
import type { BonusType } from "@prisma/client";

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
