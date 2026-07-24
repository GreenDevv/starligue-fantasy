// Script ponctuel : exécute la même logique que /api/admin/valuation/apply-lnh-scores
// en direct (pas de session admin dispo hors navigateur pour tester manuellement).
import { PrismaClient } from "@prisma/client";
import { computeValuationsFromLnhScores, type PlayerLnhScoreInput } from "../src/lib/players/valuation";
import type { Position } from "../src/lib/squad/validation";

const prisma = new PrismaClient();

async function main() {
  const seasonLabel = process.argv[2] ?? "2025/2026";

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) throw new Error("No active season");

  const players = await prisma.player.findMany({
    where: { seasonId: season.id },
    include: { lnhSeasonStats: { where: { seasonLabel } } },
  });

  const withScore = players.filter((p) => p.lnhSeasonStats.length > 0);
  const withoutScore = players.filter((p) => p.lnhSeasonStats.length === 0);

  const inputs: PlayerLnhScoreInput[] = withScore.map((p) => ({
    playerId: p.id,
    position: p.position as Position,
    avgLnhScore: Number(p.lnhSeasonStats[0]!.avgLnhScore),
  }));

  const valuations = computeValuationsFromLnhScores(inputs);
  const valuationById = new Map(valuations.map((v) => [v.playerId, v.marketValue]));

  const updates = withScore
    .map((p) => ({ player: p, newValue: valuationById.get(p.id)! }))
    .filter(({ player, newValue }) => Number(player.marketValue) !== newValue);

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.flatMap(({ player, newValue }) => [
        prisma.player.update({
          where: { id: player.id },
          data: { marketValue: newValue, valuationPending: false },
        }),
        prisma.playerValueHistory.create({ data: { playerId: player.id, value: newValue } }),
      ])
    );
  }

  const alreadyCorrectIds = withScore
    .filter((p) => valuationById.get(p.id) === Number(p.marketValue))
    .map((p) => p.id);
  if (alreadyCorrectIds.length > 0) {
    await prisma.player.updateMany({
      where: { id: { in: alreadyCorrectIds }, valuationPending: true },
      data: { valuationPending: false },
    });
  }

  console.log(JSON.stringify({
    seasonLabel,
    totalPlayers: players.length,
    valuedCount: withScore.length,
    updatedCount: updates.length,
    pendingCount: withoutScore.length,
  }, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
