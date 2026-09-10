// Gèle l'alignement de chaque équipe validée pour les journées dont la deadline
// est passée (et pas encore scorées). Extrait de src/app/api/cron/snapshot-lineups
// pour être réutilisable par le pipeline automatique src/app/api/cron/settle-gameweek.
//
// Idempotent : ne recrée pas un snapshot existant.
// Garde-fou anti-rattrapage : une équipe confirmée APRÈS la deadline d'une journée
// n'est jamais snapshotée sur cette journée (ARCHITECTURE.md §4.1, validatedAt).
import { prisma } from "@/lib/db";

export interface SnapshotResult {
  snapshotted: number;
  gameweekNumbers: number[];
}

export async function snapshotGameweekLineups(
  opts: { gameweekIds?: string[]; now?: Date } = {}
): Promise<SnapshotResult> {
  const now = opts.now ?? new Date();

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) return { snapshotted: 0, gameweekNumbers: [] };

  const gameweeks = await prisma.gameweek.findMany({
    where: {
      seasonId: season.id,
      deadlineAt: { lte: now },
      isScored: false,
      ...(opts.gameweekIds ? { id: { in: opts.gameweekIds } } : {}),
    },
    orderBy: { number: "asc" },
  });
  if (gameweeks.length === 0) return { snapshotted: 0, gameweekNumbers: [] };

  const teams = await prisma.fantasyTeam.findMany({
    where: { isValidated: true },
    include: { squad: { include: { player: { select: { position: true } } } } },
  });

  let snapshotted = 0;
  const touched = new Set<number>();

  for (const gameweek of gameweeks) {
    for (const team of teams) {
      const confirmedAt = team.validatedAt ?? team.createdAt;
      if (confirmedAt > gameweek.deadlineAt) continue;

      const existing = await prisma.fantasyLineup.findUnique({
        where: { fantasyTeamId_gameweekId: { fantasyTeamId: team.id, gameweekId: gameweek.id } },
        select: { id: true },
      });
      if (existing) continue;

      const entries = team.squad.map((s) => ({
        playerId: s.playerId,
        position: s.player.position as string,
        role: s.role as "STARTER" | "BENCH",
        purchasePrice: Number(s.purchasePrice),
        isCaptain: s.playerId === team.captainId && s.role === "STARTER",
      }));

      const bonus = team.pendingBonus;
      await prisma.$transaction(async (tx) => {
        await tx.fantasyLineup.create({
          data: { fantasyTeamId: team.id, gameweekId: gameweek.id, entries, bonus },
        });
        if (bonus !== null) {
          await tx.fantasyBonusUsage.create({
            data: { fantasyTeamId: team.id, gameweekId: gameweek.id, type: bonus },
          });
          await tx.fantasyTeam.update({ where: { id: team.id }, data: { pendingBonus: null } });
        }
      });
      // Reset en mémoire : `team` est partagé entre les itérations de gameweek,
      // ne pas réappliquer le bonus si plusieurs journées en retard sont snapshotées.
      team.pendingBonus = null;

      snapshotted++;
      touched.add(gameweek.number);
    }
  }

  return { snapshotted, gameweekNumbers: [...touched].sort((a, b) => a - b) };
}
