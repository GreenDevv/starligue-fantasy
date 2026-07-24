// Chargement d'un effectif au format attendu par validateTradeExecution
// (src/lib/trades/proposal.ts) — orchestration Prisma partagée entre la création
// d'un trade (dry-run) et son acceptation (re-validation à froid), pour éviter que
// les deux routes divergent sur la forme des données chargées.
import { prisma } from "@/lib/db";
import type { SquadPlayer } from "@/lib/squad/validation";

export interface TeamSquadForTrade {
  budget: number;
  captainId: string | null;
  squad: SquadPlayer[];
}

export async function loadTeamSquadForTrade(fantasyTeamId: string): Promise<TeamSquadForTrade | null> {
  const team = await prisma.fantasyTeam.findUnique({
    where: { id: fantasyTeamId },
    include: { squad: { include: { player: true } } },
  });
  if (!team) return null;

  return {
    budget: Number(team.budget),
    captainId: team.captainId,
    squad: team.squad.map((s) => ({
      id: s.playerId,
      position: s.player.position as SquadPlayer["position"],
      marketValue: Number(s.player.marketValue),
      isActive: s.player.isActive,
    })),
  };
}

// Équivalent Mode Simulation — SimulationSquadPlayer plutôt que FantasySquadPlayer,
// même shape en sortie pour rester utilisable telle quelle par validateTradeExecution.
export async function loadSimulationTeamSquadForTrade(simulationTeamId: string): Promise<TeamSquadForTrade | null> {
  const team = await prisma.simulationTeam.findUnique({
    where: { id: simulationTeamId },
    include: { squad: { include: { player: true } } },
  });
  if (!team) return null;

  return {
    budget: Number(team.budget),
    captainId: team.captainId,
    squad: team.squad.map((s) => ({
      id: s.playerId,
      position: s.player.position as SquadPlayer["position"],
      marketValue: Number(s.player.marketValue),
      isActive: s.player.isActive,
    })),
  };
}
