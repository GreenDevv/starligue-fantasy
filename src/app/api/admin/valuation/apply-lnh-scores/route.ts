export const dynamic = "force-dynamic";

// POST /api/admin/valuation/apply-lnh-scores — met à jour marketValue des joueurs
// qui ont un PlayerLnhSeasonStat pour la saison demandée (formule normalisée par
// poste, cf. src/lib/players/valuation.ts). Les joueurs sans score ne sont pas
// touchés : ils restent valuationPending=true ("ND"), à valoriser manuellement.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeValuationsFromLnhScores, type PlayerLnhScoreInput } from "@/lib/players/valuation";
import type { Position } from "@/lib/squad/validation";

export async function POST(req: Request) {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { seasonLabel?: string };
  const seasonLabel = body.seasonLabel ?? "2025/2026";

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ error: { code: "NO_SEASON" } }, { status: 400 });
  }

  const players = await prisma.player.findMany({
    where: { seasonId: season.id },
    include: {
      lnhSeasonStats: { where: { seasonLabel } },
    },
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
    await prisma.$transaction([
      ...updates.flatMap(({ player, newValue }) => [
        prisma.player.update({
          where: { id: player.id },
          data: { marketValue: newValue, valuationPending: false },
        }),
      ]),
      // Repasser ce bouton admin deux fois (double-clic, ré-import) ne doit pas
      // empiler une 2e ligne "pré-saison" (gameweekId null) par joueur — même
      // précaution que applyCumulativeSimulationValuation côté simulation.
      prisma.playerValueHistory.deleteMany({
        where: { gameweekId: null, playerId: { in: updates.map(({ player }) => player.id) } },
      }),
      ...updates.map(({ player, newValue }) =>
        prisma.playerValueHistory.create({
          data: { playerId: player.id, value: newValue },
        })
      ),
    ]);
  }

  // S'assure que les joueurs avec un score mais déjà à la bonne valeur sortent
  // aussi du statut "ND" (cas d'un ré-import qui ne change rien numériquement).
  const alreadyCorrectIds = withScore
    .filter((p) => valuationById.get(p.id) === Number(p.marketValue))
    .map((p) => p.id);
  if (alreadyCorrectIds.length > 0) {
    await prisma.player.updateMany({
      where: { id: { in: alreadyCorrectIds }, valuationPending: true },
      data: { valuationPending: false },
    });
  }

  return NextResponse.json({
    data: {
      seasonLabel,
      totalPlayers: players.length,
      valuedCount: withScore.length,
      updatedCount: updates.length,
      pendingCount: withoutScore.length,
    },
  });
}