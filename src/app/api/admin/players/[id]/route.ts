export const dynamic = "force-dynamic";

// PUT /api/admin/players/[id] — modifie un joueur (nom, poste, club, valeur, photo)
// DELETE /api/admin/players/[id] — supprime un joueur

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createInjuryNewsItem } from "@/lib/news/generate-injury-news";

async function requireAdmin() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") return null;
  return session;
}

const POSITIONS = ["GK", "LW", "LB", "CB", "RB", "RW", "PV"] as const;

const UpdateSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  position: z.enum(POSITIONS).optional(),
  clubId: z.string().min(1).optional(),
  marketValue: z.coerce.number().min(0.5).max(99.9).optional(),
  photoUrl: z.string().url().optional().or(z.literal("")).optional(),
  isActive: z.boolean().optional(),
  injuredAt: z.string().datetime().nullable().optional(),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", details: parsed.error.issues } }, { status: 400 });
  }

  const { photoUrl, injuredAt, ...rest } = parsed.data;

  const before = await prisma.player.findUnique({ where: { id: params.id }, select: { injuredAt: true, marketValue: true } });

  const valueChanged = rest.marketValue !== undefined && before !== null && rest.marketValue !== Number(before.marketValue);

  const player = await prisma.$transaction(async (tx) => {
    const updated = await tx.player.update({
      where: { id: params.id },
      data: {
        ...rest,
        // Une valeur saisie à la main sort le joueur du statut "ND" (valorisation en attente).
        ...(rest.marketValue !== undefined ? { valuationPending: false } : {}),
        ...(photoUrl !== undefined ? { photoUrl: photoUrl === "" ? null : photoUrl } : {}),
        ...(injuredAt !== undefined ? { injuredAt: injuredAt === null ? null : new Date(injuredAt) } : {}),
      },
      include: { club: { select: { id: true, name: true, shortName: true } } },
    });
    // Trace la correction dans l'historique, au même titre que l'import .xlsx en
    // masse (src/app/api/admin/import/player-values/route.ts) — sinon le graphique
    // d'évolution de valeur du joueur ignore silencieusement les éditions faites
    // une par une depuis ce formulaire.
    if (valueChanged) {
      await tx.playerValueHistory.create({ data: { playerId: updated.id, value: updated.marketValue } });
    }
    return updated;
  });

  // Actu générée pour la page publique /starligue — best-effort, jamais dans la même
  // transaction que l'update ci-dessus (une panne d'écriture d'actu ne doit jamais
  // faire régresser la déclaration de blessure, qui a déjà committé à ce stade).
  if (injuredAt !== undefined && (before?.injuredAt?.getTime() ?? null) !== (player.injuredAt?.getTime() ?? null)) {
    try {
      await createInjuryNewsItem({
        id: player.id,
        firstName: player.firstName,
        lastName: player.lastName,
        seasonId: player.seasonId,
        injuredAt: player.injuredAt,
        club: player.club,
      });
    } catch (e) {
      console.error("[injury-news]", e);
    }
  }

  return NextResponse.json({
    data: {
      id: player.id,
      firstName: player.firstName,
      lastName: player.lastName,
      position: player.position,
      marketValue: Number(player.marketValue),
      valuationPending: player.valuationPending,
      photoUrl: player.photoUrl,
      isActive: player.isActive,
      injuredAt: player.injuredAt,
      club: player.club,
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  // Vérifie qu'aucun squad ne référence ce joueur
  const squadRefs = await prisma.fantasySquadPlayer.count({
    where: { playerId: params.id },
  });
  if (squadRefs > 0) {
    return NextResponse.json(
      { error: { code: "PLAYER_IN_USE", message: `Ce joueur est dans ${squadRefs} équipe(s) fantasy` } },
      { status: 409 }
    );
  }

  await prisma.player.delete({ where: { id: params.id } });
  return NextResponse.json({ data: { deleted: true } });
}