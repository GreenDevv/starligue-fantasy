export const dynamic = "force-dynamic";

// POST /api/admin/import/players — ARCHITECTURE.md §6.6
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { CsvProvider } from "@/lib/data-providers/csv.provider";
import { prisma } from "@/lib/db";

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

  const text = await file.text();
  const result = CsvProvider.parsePlayers(text);
  if (!result.ok) {
    return NextResponse.json({ error: { code: "PARSE_ERROR", message: "Erreurs CSV", details: result.errors } }, { status: 422 });
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ error: { code: "NO_ACTIVE_SEASON", message: "Aucune saison active" } }, { status: 400 });
  }

  let upserted = 0;
  const errors: string[] = [];

  for (const row of result.rows) {
    const club = await prisma.club.findFirst({ where: { shortName: row.clubShortName } });
    if (!club) {
      errors.push(`Club inconnu : ${row.clubShortName}`);
      continue;
    }

    await prisma.player.upsert({
      where: {
        seasonId_clubId_firstName_lastName: {
          seasonId: season.id,
          clubId: club.id,
          firstName: row.firstName,
          lastName: row.lastName,
        },
      },
      update: { position: row.position, marketValue: row.marketValue },
      create: {
        seasonId: season.id,
        clubId: club.id,
        firstName: row.firstName,
        lastName: row.lastName,
        position: row.position,
        marketValue: row.marketValue,
      },
    });
    upserted++;
  }

  return NextResponse.json({ data: { upserted, errors } });
}