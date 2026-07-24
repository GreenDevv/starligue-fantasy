export const dynamic = "force-dynamic";

// POST /api/admin/import/player-photos — applique le dataset curaté
// prisma/player_photos_2026.json (photos trouvées sur les sites officiels de club,
// hotlink uniquement) : met à jour photoUrl des joueurs existants uniquement (ne crée
// ni ne supprime aucun joueur — un nom/club non reconnu est remonté en erreur).
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { matchPlayerPhotoRows, type PlayerPhotoRow } from "@/lib/players/photo-import";

const photoDatasetSchema = z.record(
  z.object({
    sourcePageUrl: z.string().nullable(),
    matches: z.array(
      z.object({
        firstName: z.string(),
        lastName: z.string(),
        photoUrl: z.string(),
        confidence: z.enum(["high", "medium"]),
      }),
    ),
    notes: z.string(),
  }),
);

export async function POST() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Accès refusé" } }, { status: 403 });
  }

  const filePath = path.join(process.cwd(), "prisma", "player_photos_2026.json");
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return NextResponse.json(
      { error: { code: "DATASET_MISSING", message: "prisma/player_photos_2026.json introuvable" } },
      { status: 400 },
    );
  }

  const parsed = photoDatasetSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "PARSE_ERROR", message: "Dataset invalide", details: parsed.error.issues } },
      { status: 422 },
    );
  }

  const rows: PlayerPhotoRow[] = Object.entries(parsed.data).flatMap(([clubShortName, club]) =>
    club.matches.map((m) => ({
      nom: m.lastName,
      prenom: m.firstName,
      club: clubShortName,
      photoUrl: m.photoUrl,
    })),
  );

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ error: { code: "NO_ACTIVE_SEASON", message: "Aucune saison active" } }, { status: 400 });
  }

  const players = await prisma.player.findMany({
    where: { seasonId: season.id },
    include: { club: { select: { shortName: true } } },
  });

  const { updates, unchanged, unmatched } = matchPlayerPhotoRows(
    rows,
    players.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      clubShortName: p.club.shortName,
      photoUrl: p.photoUrl,
    })),
  );

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) => prisma.player.update({ where: { id: u.playerId }, data: { photoUrl: u.newPhotoUrl } })),
    );
  }

  return NextResponse.json({
    data: {
      totalRows: rows.length,
      updated: updates.length,
      unchanged: unchanged.length,
      unmatched: unmatched.map((u) => ({ ...u.row, reason: u.reason })),
    },
  });
}