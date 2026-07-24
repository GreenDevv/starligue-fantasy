// compute-scores pour le Mode Simulation — même moteur pur que
// src/lib/scoring/compute.ts (computeLineupPoints/computePlayerPoints, inchangés),
// mais orchestration Prisma dédiée à SimulationLineup/SimulationTeam plutôt que
// FantasyLineup/FantasyTeam. Contrairement au jeu en direct, une seule équipe est
// concernée à la fois (chaque simulation avance à son propre rythme).
import { prisma } from "@/lib/db";
import { computeLineupPoints, parseScoringConfig, type LineupEntry } from "./engine";
import { computeStatLeaderBonuses, type StatLeaderPlayerInput } from "./stat-leaders";
import { applyGameweekValueAdjustments } from "@/lib/players/apply-value-adjustment";
import { Decimal } from "@prisma/client/runtime/library";

interface LineupEntryJson {
  playerId: string;
  position: string;
  role: "STARTER" | "BENCH";
  purchasePrice: number;
  isCaptain?: boolean;
}

export async function computeSimulationGameweekScores(
  simulationLineupId: string,
  options: { skipValueAdjustment?: boolean } = {}
): Promise<{ points: number }> {
  const lineup = await prisma.simulationLineup.findUniqueOrThrow({
    where: { id: simulationLineupId },
    include: {
      gameweek: {
        include: {
          matches: { include: { playerStats: true } },
        },
      },
    },
  });

  // Valeur marchande dynamique : ajustée une seule fois par journée (idempotent),
  // même si plusieurs SimulationTeam traversent cette journée à des moments différents.
  // skipValueAdjustment : depuis l'avancée admin globale (advance-plan.ts), la
  // valorisation simulation est recalculée en absolu via
  // applyCumulativeSimulationValuation (src/lib/players/simulation-valuation.ts) —
  // cumuler EN PLUS cet ajustement incrémental (±pas fixe sur le top/bottom de la
  // seule note du jour) contredirait ce recalcul. Le live (compute.ts) appelle
  // applyGameweekValueAdjustments directement, pas via cette fonction — paramètre
  // sans aucun effet sur le live.
  if (!options.skipValueAdjustment) {
    await applyGameweekValueAdjustments(lineup.gameweekId);
  }

  const configs = await prisma.gameConfig.findMany();
  const scoringConfig = parseScoringConfig(Object.fromEntries(configs.map((c) => [c.key, c.value])));

  const statsByPlayer = new Map<string, { lnhRating: number | null; played: boolean; teamWon: boolean }>();
  for (const match of lineup.gameweek.matches) {
    const homeWon = match.homeScore !== null && match.awayScore !== null && match.homeScore > match.awayScore;
    const awayWon = match.homeScore !== null && match.awayScore !== null && match.awayScore > match.homeScore;

    for (const stat of match.playerStats) {
      statsByPlayer.set(stat.playerId, {
        lnhRating: stat.lnhRating !== null ? Number(stat.lnhRating) : null,
        played: stat.played,
        teamWon: false, // résolu ci-dessous
      });
    }
    for (const stat of match.playerStats) {
      const player = await prisma.player.findUnique({ where: { id: stat.playerId }, select: { clubId: true } });
      if (!player) continue;
      const teamWon = player.clubId === match.homeClubId ? homeWon : awayWon;
      statsByPlayer.set(stat.playerId, { ...statsByPlayer.get(stat.playerId)!, teamWon });
    }
  }

  // Bonus/malus "leader de journée" (src/lib/scoring/stat-leaders.ts) — calculé une
  // seule fois pour toute la journée (tous clubs confondus), pas par équipe simulée.
  const statLeaderRows: StatLeaderPlayerInput[] = lineup.gameweek.matches.flatMap((match) =>
    match.playerStats.map((stat) => ({
      playerId: stat.playerId,
      played: stat.played,
      goalsPlay: stat.goalsPlay,
      goalsPenalty: stat.goalsPenalty,
      goalsTotal: stat.goalsTotal,
      shotPercentage: stat.shotPercentage !== null ? Number(stat.shotPercentage) : null,
      assists: stat.assists,
      ballsRecovered: stat.ballsRecovered,
      opponentShotsBlocked: stat.opponentShotsBlocked,
      penaltiesDrawn: stat.penaltiesDrawn,
      twoMinDrawn: stat.twoMinDrawn,
      neutralizations: stat.neutralizations,
      turnovers: stat.turnovers,
      twoMinTaken: stat.twoMinTaken,
      disqualified: stat.disqualified,
    }))
  );
  const statBonusByPlayer = computeStatLeaderBonuses(statLeaderRows, {
    enabled: scoringConfig.statLeaderBonusEnabled,
    bonusPoints: scoringConfig.statLeaderBonusPoints,
    malusPoints: scoringConfig.statLeaderMalusPoints,
  });

  const entries = lineup.entries as unknown as LineupEntryJson[];
  const lineupInputs: LineupEntry[] = entries.map((e) => {
    const stat = statsByPlayer.get(e.playerId);
    return {
      lnhRating: stat?.lnhRating ?? null,
      played: stat?.played ?? false,
      role: e.role,
      teamWon: stat?.teamWon ?? false,
      isCaptain: e.isCaptain ?? false,
      statBonusPoints: statBonusByPlayer.get(e.playerId) ?? 0,
    };
  });

  const points = computeLineupPoints(lineupInputs, scoringConfig, lineup.bonus);

  await prisma.simulationLineup.update({
    where: { id: lineup.id },
    data: { points: new Decimal(points) },
  });

  await recalcSimulationTeamTotalPoints(lineup.simulationTeamId);

  return { points };
}

// totalPoints = Σ(lineup.points) - pointsConverted — même raison qu'en jeu en
// direct (src/lib/scoring/compute.ts::recalcTotalPoints) : la conversion points →
// budget doit survivre à un recompute qui recalcule tout depuis SimulationLineup.
// Réutilisé par l'avancée ET le retour en arrière admin (src/lib/simulation/admin-advance.ts)
// — un retour en arrière supprime la SimulationLineup de la journée annulée, donc
// ce recalcul retombe naturellement sur le total d'avant sans logique dupliquée.
export async function recalcSimulationTeamTotalPoints(simulationTeamId: string): Promise<number> {
  const [allLineups, team] = await Promise.all([
    prisma.simulationLineup.findMany({
      where: { simulationTeamId, points: { not: null } },
      select: { points: true },
    }),
    prisma.simulationTeam.findUniqueOrThrow({
      where: { id: simulationTeamId },
      select: { pointsConverted: true },
    }),
  ]);
  const rawTotal = allLineups.reduce((s, l) => s + Number(l.points ?? 0), 0);
  const total = rawTotal - Number(team.pointsConverted);
  const rounded = Math.round(total * 10) / 10;
  await prisma.simulationTeam.update({
    where: { id: simulationTeamId },
    data: { totalPoints: new Decimal(rounded) },
  });
  return rounded;
}
