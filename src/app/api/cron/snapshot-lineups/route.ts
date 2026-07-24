// POST /api/cron/snapshot-lineups — ARCHITECTURE.md §6.7
// Gèle l'alignement de chaque équipe validée pour les journées dont la deadline vient de passer.
// Idempotent : ne crée pas si un snapshot existe déjà.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron-auth";

export async function POST(request: Request) {
  if (!(await verifyCronAuth(request))) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const now = new Date();

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  const gameweeks = season
    ? await prisma.gameweek.findMany({
        where: { seasonId: season.id, deadlineAt: { lte: now }, isScored: false },
        orderBy: { number: "asc" },
      })
    : [];

  if (gameweeks.length === 0) {
    return NextResponse.json({ data: { snapshotted: 0 } });
  }

  const teams = await prisma.fantasyTeam.findMany({
    where: { isValidated: true },
    include: {
      squad: {
        include: { player: { select: { position: true } } },
      },
    },
  });

  let snapshotted = 0;

  for (const gameweek of gameweeks) {
    for (const team of teams) {
      const existing = await prisma.fantasyLineup.findUnique({
        where: {
          fantasyTeamId_gameweekId: {
            fantasyTeamId: team.id,
            gameweekId: gameweek.id,
          },
        },
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

      // Consomme le bonus en attente (s'il y en a un) : snapshoté sur le lineup et
      // marqué comme utilisé pour la saison (FantasyBonusUsage, 1×/saison/type).
      // Reset immédiat en mémoire sur `team` (partagé entre les itérations de
      // gameweek ci-dessus) pour ne pas le réappliquer si plusieurs journées en
      // retard sont snapshotées dans ce même run.
      const bonus = team.pendingBonus;
      await prisma.$transaction(async (tx) => {
        await tx.fantasyLineup.create({
          data: {
            fantasyTeamId: team.id,
            gameweekId: gameweek.id,
            entries,
            bonus,
          },
        });
        if (bonus !== null) {
          await tx.fantasyBonusUsage.create({
            data: { fantasyTeamId: team.id, gameweekId: gameweek.id, type: bonus },
          });
          await tx.fantasyTeam.update({ where: { id: team.id }, data: { pendingBonus: null } });
        }
      });
      team.pendingBonus = null;

      snapshotted++;
    }
  }

  return NextResponse.json({ data: { snapshotted } });
}
