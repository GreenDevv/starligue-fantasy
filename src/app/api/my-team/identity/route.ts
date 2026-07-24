export const dynamic = "force-dynamic";

// PUT /api/my-team/identity — nom + maillot de l'équipe (remplace le PUT
// /api/my-team/name jamais construit — ARCHITECTURE.md §6.3)
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveActiveLeagueId } from "@/lib/team/active-league";
import { jerseyConfigSchema } from "@/lib/team/jersey";
import { resolveSeasonMode } from "@/lib/team/active-team-context";

const bodySchema = z.object({
  leagueId: z.string().cuid().optional(),
  name: z.string().min(1).max(50),
  jerseyConfig: jerseyConfigSchema,
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

  // Personnalisation de maillot = concept live uniquement (SimulationTeam n'a pas
  // de jerseyConfig, divergence délibérée du schéma) — jamais linké en simulation,
  // mais garde défensive au cas où la route serait appelée hors mode live.
  if (resolveSeasonMode() === "simulation") {
    return NextResponse.json(
      { error: { code: "NOT_APPLICABLE", message: "Pas de personnalisation de maillot en mode Simulation" } },
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
    data: { name: parsed.data.name, jerseyConfig: parsed.data.jerseyConfig },
    select: { id: true, name: true, jerseyConfig: true },
  });

  return NextResponse.json({ data: updated });
}