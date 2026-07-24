export const dynamic = "force-dynamic";

// POST /api/admin/import/ratings — ARCHITECTURE.md §6.6
// Importe les notes LNH et déclenche compute-scores si toutes les notes sont là.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { CsvProvider } from "@/lib/data-providers/csv.provider";
import { prisma } from "@/lib/db";
import { computeGameweekScores } from "@/lib/scoring/compute";

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
  const result = CsvProvider.parseRatings(text);
  if (!result.ok) {
    return NextResponse.json({ error: { code: "PARSE_ERROR", message: "Erreurs CSV", details: result.errors } }, { status: 422 });
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ error: { code: "NO_ACTIVE_SEASON", message: "Aucune saison active" } }, { status: 400 });
  }

  let upserted = 0;
  const errors: string[] = [];
  const affectedGameweeks = new Set<string>();

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
    if (!match) { errors.push(`Match ${row.homeShortName}-${row.awayShortName} J${row.gameweek} introuvable`); continue; }

    const club = await prisma.club.findFirst({ where: { shortName: row.clubShortName } });
    if (!club) { errors.push(`Club ${row.clubShortName} inconnu`); continue; }

    const player = await prisma.player.findFirst({
      where: { seasonId: season.id, clubId: club.id, firstName: row.firstName, lastName: row.lastName },
    });
    if (!player) { errors.push(`Joueur ${row.firstName} ${row.lastName} (${row.clubShortName}) introuvable`); continue; }

    await prisma.playerMatchStat.upsert({
      where: { matchId_playerId: { matchId: match.id, playerId: player.id } },
      update: { lnhRating: row.lnhRating, played: row.played, source: "CSV" },
      create: { matchId: match.id, playerId: player.id, lnhRating: row.lnhRating, played: row.played, source: "CSV" },
    });
    upserted++;
    affectedGameweeks.add(gameweek.id);
  }

  // Tente compute-scores sur chaque journée affectée
  const computed: number[] = [];
  for (const gwId of affectedGameweeks) {
    try {
      await computeGameweekScores(gwId);
      computed.push(gwId as unknown as number);
    } catch {
      // journée pas encore complète — normal
    }
  }

  return NextResponse.json({ data: { upserted, errors, computedGameweeks: computed.length } });
}