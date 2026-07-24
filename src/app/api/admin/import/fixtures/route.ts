export const dynamic = "force-dynamic";

// POST /api/admin/import/fixtures — ARCHITECTURE.md §6.6
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
  const result = CsvProvider.parseFixtures(text);
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
    const gameweek = await prisma.gameweek.findUnique({
      where: { seasonId_number: { seasonId: season.id, number: row.gameweek } },
    });
    if (!gameweek) { errors.push(`Journée ${row.gameweek} introuvable`); continue; }

    const homeClub = await prisma.club.findFirst({ where: { shortName: row.homeShortName } });
    const awayClub = await prisma.club.findFirst({ where: { shortName: row.awayShortName } });
    if (!homeClub) { errors.push(`Club domicile inconnu : ${row.homeShortName}`); continue; }
    if (!awayClub) { errors.push(`Club extérieur inconnu : ${row.awayShortName}`); continue; }

    const kickoffAt = new Date(row.date.replace(" ", "T") + ":00");
    const existing = await prisma.match.findFirst({
      where: { gameweekId: gameweek.id, homeClubId: homeClub.id, awayClubId: awayClub.id },
    });

    const data = { seasonId: season.id, gameweekId: gameweek.id, homeClubId: homeClub.id, awayClubId: awayClub.id, kickoffAt, externalIds: { source: "CSV" } };
    if (existing) {
      await prisma.match.update({ where: { id: existing.id }, data: { kickoffAt } });
    } else {
      await prisma.match.create({ data });
    }
    upserted++;
  }

  return NextResponse.json({ data: { upserted, errors } });
}