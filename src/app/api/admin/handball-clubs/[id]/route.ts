export const dynamic = "force-dynamic";

// PATCH /api/admin/handball-clubs/[id] — ARCHITECTURE.md §23.5.
//   { action: "verify" }          → publie une saisie libre (verified = true)
//   { action: "merge", intoId }   → fusionne ce club dans `intoId` : repointe les
//                                   User.homeClubId puis supprime la ligne. En
//                                   transaction.
// DELETE /api/admin/handball-clubs/[id] — rejette une saisie libre : supprime le
//   club (MANUAL non vérifié uniquement). Le FK `onDelete: SetNull` détache
//   automatiquement les membres → ils se retrouvent sans club et peuvent en
//   saisir un autre.
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { geocodeCity } from "@/lib/geo/cities";

async function requireAdmin() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") return null;
  return session;
}

const patchSchema = z.union([
  z.object({ action: z.literal("verify") }),
  z.object({ action: z.literal("merge"), intoId: z.string().min(1) }),
]);

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Données invalides" } },
      { status: 400 },
    );
  }

  const club = await prisma.handballClub.findUnique({
    where: { id: params.id },
    select: { id: true, city: true, country: true, latitude: true, longitude: true },
  });
  if (!club) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  if (parsed.data.action === "verify") {
    // Géocode au passage si le club a une ville mais pas encore de coordonnées
    // (saisie libre où l'utilisateur n'a pas choisi la ville dans l'autocomplétion,
    // ou ville corrigée par l'admin) → il apparaît sur la carte dès validation.
    const coords =
      club.latitude == null && club.city ? geocodeCity(club.city, club.country) : null;
    const updated = await prisma.handballClub.update({
      where: { id: params.id },
      data: { verified: true, ...(coords ?? {}) },
      select: { id: true, verified: true, latitude: true, longitude: true },
    });
    return NextResponse.json({ data: updated });
  }

  // merge
  const { intoId } = parsed.data;
  if (intoId === params.id) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Impossible de fusionner un club avec lui-même" } },
      { status: 400 },
    );
  }
  const target = await prisma.handballClub.findUnique({ where: { id: intoId }, select: { id: true } });
  if (!target) {
    return NextResponse.json({ error: { code: "TARGET_NOT_FOUND", message: "Club cible introuvable" } }, { status: 404 });
  }

  const moved = await prisma.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({
      where: { homeClubId: params.id },
      data: { homeClubId: intoId },
    });
    await tx.handballClub.delete({ where: { id: params.id } });
    return count;
  });

  return NextResponse.json({ data: { mergedInto: intoId, membersMoved: moved } });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const club = await prisma.handballClub.findUnique({
    where: { id: params.id },
    select: { id: true, source: true, verified: true, _count: { select: { members: true } } },
  });
  if (!club) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }
  // Filet : on ne supprime qu'une saisie libre en attente. Un club de l'annuaire
  // (FFHANDBALL) ou déjà validé ne se supprime pas ici — il serait recréé au
  // prochain sync et/ou détacherait des membres légitimes.
  if (club.source !== "MANUAL" || club.verified) {
    return NextResponse.json(
      { error: { code: "NOT_DELETABLE", message: "Seule une saisie libre non validée peut être rejetée" } },
      { status: 409 },
    );
  }

  // FK User.homeClubId → onDelete: SetNull : les membres sont détachés automatiquement.
  await prisma.handballClub.delete({ where: { id: params.id } });

  return NextResponse.json({ data: { deleted: true, membersUnlinked: club._count.members } });
}
