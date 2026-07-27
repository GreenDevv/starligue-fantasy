export const dynamic = "force-dynamic";

// GET  /api/account — infos du compte connecté (pseudo, email, joueur préféré)
// PUT  /api/account — modifie le pseudo et/ou le joueur préféré

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Connexion requise" } }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      favoritePlayerId: true,
      favoritePlayer: { select: { id: true, firstName: true, lastName: true, club: { select: { shortName: true } } } },
    },
  });
  if (!user) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  return NextResponse.json({ data: user });
}

const updateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  // "" = retirer le joueur préféré, undefined = ne pas toucher au champ.
  favoritePlayerId: z.string().min(1).nullable().optional(),
});

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Connexion requise" } }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Données invalides" } },
      { status: 400 },
    );
  }

  const { name, favoritePlayerId } = parsed.data;

  if (favoritePlayerId) {
    const player = await prisma.player.findUnique({ where: { id: favoritePlayerId }, select: { id: true } });
    if (!player) {
      return NextResponse.json({ error: { code: "INVALID_PLAYER", message: "Joueur préféré introuvable" } }, { status: 422 });
    }
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(favoritePlayerId !== undefined ? { favoritePlayerId: favoritePlayerId || null } : {}),
    },
    select: {
      name: true,
      email: true,
      favoritePlayerId: true,
      favoritePlayer: { select: { id: true, firstName: true, lastName: true, club: { select: { shortName: true } } } },
    },
  });

  return NextResponse.json({ data: user });
}
