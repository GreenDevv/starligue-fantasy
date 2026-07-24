// GET /api/admin/players/export — export .xlsx (nom, prenom, club, valeur) de
// l'effectif actif de la saison active, pour révision externe de la valorisation.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildPlayerValuesXlsx } from "@/lib/data-providers/xlsx-players.provider";

export async function GET() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Accès refusé" } }, { status: 403 });
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ error: { code: "NO_ACTIVE_SEASON", message: "Aucune saison active" } }, { status: 400 });
  }

  const players = await prisma.player.findMany({
    where: { seasonId: season.id, isActive: true },
    include: { club: { select: { shortName: true } } },
    orderBy: [{ club: { shortName: "asc" } }, { lastName: "asc" }],
  });

  const buffer = await buildPlayerValuesXlsx(
    players.map((p) => ({
      nom: p.lastName,
      prenom: p.firstName,
      club: p.club.shortName,
      valeur: Number(p.marketValue),
      valuationPending: p.valuationPending,
    })),
  );

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="valorisation_joueurs_${season.label}.xlsx"`,
    },
  });
}
