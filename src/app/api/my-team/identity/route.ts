export const dynamic = "force-dynamic";

// PUT /api/my-team/identity — renommage d'équipe (remplace le PUT
// /api/my-team/name jamais construit — ARCHITECTURE.md §6.3). Gérait aussi
// jerseyConfig avant la suppression de l'éditeur de maillot ; le nom du
// endpoint reste "identity" pour ne pas casser l'appelant existant.
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveActiveLeagueId } from "@/lib/team/active-league";

const bodySchema = z.object({
  leagueId: z.string().cuid().optional(),
  name: z.string().min(1).max(50),
});

export async function PUT(request: Request) {
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

  const userId = session.user.id;
  const leagueId = await resolveActiveLeagueId(userId, parsed.data.leagueId);
  if (!leagueId) {
    return NextResponse.json(
      { error: { code: "NO_ACTIVE_LEAGUE", message: "Aucune ligue active" } },
      { status: 404 }
    );
  }

  const team = await prisma.fantasyTeam.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
    select: { id: true },
  });
  if (!team) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Équipe introuvable" } }, { status: 404 });
  }

  const updated = await prisma.fantasyTeam.update({
    where: { id: team.id },
    data: { name: parsed.data.name },
    select: { id: true, name: true },
  });

  return NextResponse.json({ data: updated });
}
