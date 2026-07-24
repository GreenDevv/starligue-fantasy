// POST /api/admin/import/results — ARCHITECTURE.md §6.6
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
  const result = CsvProvider.parseResults(text);
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

    const match = await prisma.match.findFirst({
      where: {
        gameweekId: gameweek.id,
        homeClub: { shortName: row.homeShortName },
        awayClub: { shortName: row.awayShortName },
      },
    });
    if (!match) { errors.push(`Match ${row.homeShortName}-${row.awayShortName} introuvable`); continue; }

    await prisma.match.update({
      where: { id: match.id },
      data: { homeScore: row.homeScore, awayScore: row.awayScore, status: "FINISHED" },
    });
    upserted++;
  }

  return NextResponse.json({ data: { upserted, errors } });
}
