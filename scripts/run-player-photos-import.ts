// Script ponctuel : exécute la même logique que /api/admin/import/player-photos
// en direct (pas de session admin dispo hors navigateur pour tester manuellement).
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { matchPlayerPhotoRows, type PlayerPhotoRow } from "../src/lib/players/photo-import";

const prisma = new PrismaClient();

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

async function main() {
  const filePath = path.join(process.cwd(), "prisma", "player_photos_2026.json");
  const raw = await readFile(filePath, "utf-8");
  const parsed = photoDatasetSchema.parse(JSON.parse(raw));

  const rows: PlayerPhotoRow[] = Object.entries(parsed).flatMap(([clubShortName, club]) =>
    club.matches.map((m) => ({
      nom: m.lastName,
      prenom: m.firstName,
      club: clubShortName,
      photoUrl: m.photoUrl,
    })),
  );

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) throw new Error("NO_ACTIVE_SEASON");

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

  console.log(JSON.stringify({
    totalRows: rows.length,
    updated: updates.length,
    unchanged: unchanged.length,
    unmatchedCount: unmatched.length,
  }, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
