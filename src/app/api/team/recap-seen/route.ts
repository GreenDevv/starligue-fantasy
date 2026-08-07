export const dynamic = "force-dynamic";

// POST /api/team/recap-seen — marque le récap de journée (GameweekRecapModal) vu
// pour une équipe, jusqu'à la journée indiquée. Idempotent et sans effet arrière
// (Math.max) : un double appel ou un appel avec un gameweekNumber plus ancien que
// la valeur déjà stockée ne fait jamais reculer le marqueur.
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const bodySchema = z.object({
  teamId: z.string().cuid(),
  mode: z.enum(["live", "simulation"]),
  gameweekNumber: z.number().int().positive(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: parsed.error.message } },
      { status: 400 }
    );
  }

  const { teamId, mode, gameweekNumber } = parsed.data;
  const userId = session.user.id;

  const team =
    mode === "simulation"
      ? await prisma.simulationTeam.findUnique({
          where: { id: teamId },
          select: { userId: true, lastPointsSeenGameweekNumber: true },
        })
      : await prisma.fantasyTeam.findUnique({
          where: { id: teamId },
          select: { userId: true, lastPointsSeenGameweekNumber: true },
        });

  if (!team || team.userId !== userId) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const nextValue = Math.max(team.lastPointsSeenGameweekNumber, gameweekNumber);
  if (nextValue !== team.lastPointsSeenGameweekNumber) {
    if (mode === "simulation") {
      await prisma.simulationTeam.update({ where: { id: teamId }, data: { lastPointsSeenGameweekNumber: nextValue } });
    } else {
      await prisma.fantasyTeam.update({ where: { id: teamId }, data: { lastPointsSeenGameweekNumber: nextValue } });
    }
  }

  return NextResponse.json({ data: { teamId, lastPointsSeenGameweekNumber: nextValue } });
}
