// POST /api/admin/import/player-values — réimporte un .xlsx (nom, prenom, club,
// valeur) : met à jour marketValue des joueurs existants uniquement (ne crée ni
// ne supprime aucun joueur — un nom/club non reconnu est remonté en erreur).
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parsePlayerValuesXlsx } from "@/lib/data-providers/xlsx-players.provider";
import { matchPlayerValueRows } from "@/lib/players/value-import";

export async function POST(req: Request) {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Accès refusé" } }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: { code: "NO_FILE", message: "Fichier manquant" } }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await parsePlayerValuesXlsx(buffer);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: { code: "PARSE_ERROR", message: "Erreurs dans le fichier", details: parsed.errors } },
      { status: 422 },
    );
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ error: { code: "NO_ACTIVE_SEASON", message: "Aucune saison active" } }, { status: 400 });
  }

  const players = await prisma.player.findMany({
    where: { seasonId: season.id },
    include: { club: { select: { shortName: true } } },
  });

  const { updates, unchanged, unmatched } = matchPlayerValueRows(
    parsed.rows,
    players.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      clubShortName: p.club.shortName,
      marketValue: Number(p.marketValue),
    })),
  );

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.flatMap((u) => [
        // Une valeur réimportée sort le joueur du statut "ND" (valorisation en attente).
        prisma.player.update({ where: { id: u.playerId }, data: { marketValue: u.newValue, valuationPending: false } }),
        prisma.playerValueHistory.create({ data: { playerId: u.playerId, value: u.newValue } }),
      ]),
    );
  }

  // Un joueur "ND" dont la valeur réimportée coïncide avec le placeholder actuel a
  // quand même été revu par le consultant — on le sort du statut ND aussi.
  const playerById = new Map(players.map((p) => [p.id, p]));
  const confirmedPendingIds = unchanged
    .map((u) => playerById.get(u.playerId))
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.valuationPending))
    .map((p) => p.id);
  if (confirmedPendingIds.length > 0) {
    await prisma.player.updateMany({
      where: { id: { in: confirmedPendingIds } },
      data: { valuationPending: false },
    });
  }

  return NextResponse.json({
    data: {
      totalRows: parsed.rows.length,
      updated: updates.length,
      unchanged: unchanged.length,
      unmatched: unmatched.map((u) => ({ ...u.row, reason: u.reason })),
    },
  });
}
