// Applique l'ajustement de valeur marchande d'une journée (src/lib/players/value-adjustment.ts)
// — orchestration Prisma, partagée entre le jeu en direct et le Mode Simulation
// (Player/PlayerMatchStat/Gameweek sont des tables partagées, pas de duplication
// nécessaire ici contrairement au reste du pipeline de scoring).
//
// Idempotent par gameweekId : plusieurs SimulationTeam peuvent traverser la même
// journée, et computeGameweekScores (live) est rejouable — la garde empêche un
// double-ajustement. Limite acceptée : un recompute suite à une correction tardive
// de note ne recalcule PAS la valeur (déjà appliquée avec l'ancienne note).
import { prisma } from "@/lib/db";
import { Decimal } from "@prisma/client/runtime/library";
import { computeGameweekValueDeltas } from "./value-adjustment";
import type { Position } from "@/lib/squad/validation";

export async function applyGameweekValueAdjustments(
  gameweekId: string,
): Promise<{ applied: boolean; changed: number }> {
  const already = await prisma.playerValueHistory.findFirst({
    where: { gameweekId },
    select: { id: true },
  });
  if (already) return { applied: false, changed: 0 };

  const configs = await prisma.gameConfig.findMany({
    where: {
      key: {
        in: [
          "VALUE_ADJUSTMENT_STEP",
          "VALUE_ADJUSTMENT_TOP_N",
          "VALUE_ADJUSTMENT_BOTTOM_N",
          "VALUE_ADJUSTMENT_MIN",
        ],
      },
    },
  });
  const raw = Object.fromEntries(configs.map((c) => [c.key, c.value]));
  const config = {
    step: parseFloat(raw["VALUE_ADJUSTMENT_STEP"] ?? "0.5"),
    topN: parseInt(raw["VALUE_ADJUSTMENT_TOP_N"] ?? "5", 10),
    bottomN: parseInt(raw["VALUE_ADJUSTMENT_BOTTOM_N"] ?? "5", 10),
  };
  const minValue = parseFloat(raw["VALUE_ADJUSTMENT_MIN"] ?? "1.0");

  const stats = await prisma.playerMatchStat.findMany({
    where: { match: { gameweekId }, played: true, lnhRating: { not: null } },
    include: { player: { select: { id: true, position: true, marketValue: true } } },
  });

  const entries = stats.map((s) => ({
    playerId: s.playerId,
    position: s.player.position as Position,
    lnhRating: Number(s.lnhRating),
  }));

  const deltas = computeGameweekValueDeltas(entries, config);
  if (deltas.size === 0) return { applied: true, changed: 0 };

  const marketValueByPlayerId = new Map(stats.map((s) => [s.playerId, Number(s.player.marketValue)]));

  await prisma.$transaction(
    Array.from(deltas.entries()).flatMap(([playerId, delta]) => {
      const current = marketValueByPlayerId.get(playerId) ?? 0;
      const next = Math.max(minValue, Math.round((current + delta) * 10) / 10);
      return [
        prisma.player.update({ where: { id: playerId }, data: { marketValue: new Decimal(next) } }),
        prisma.playerValueHistory.create({ data: { playerId, value: new Decimal(next), gameweekId } }),
      ];
    }),
  );

  return { applied: true, changed: deltas.size };
}
