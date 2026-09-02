// Script ponctuel : exécute la même logique que
// POST /api/admin/import/lnh-player-photos hors navigateur (pas de session admin
// dispo). Scrape /daikin-starligue/joueurs (lnh.fr) et applique les vraies photos
// détourées aux joueurs de la saison active.
//
// Dry-run par défaut ; `--apply` pour écrire réellement.
// La base cible = DATABASE_URL de l'environnement (penser à pointer la prod Railway
// avec ?sslmode=require, cf. mémoire prod-database-access).
import { PrismaClient } from "@prisma/client";
import { createLnhScraperProvider } from "../src/lib/data-providers/lnh-scraper.provider";
import { matchPlayerPhotoRows, type PlayerPhotoRow } from "../src/lib/players/photo-import";

const LNH_SEASONS_ID_2026_2027 = "40";
const APPLY = process.argv.includes("--apply");

const prisma = new PrismaClient();

async function main() {
  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) throw new Error("NO_ACTIVE_SEASON");

  const provider = createLnhScraperProvider();
  const scraped = await provider.fetchPlayerPhotos(LNH_SEASONS_ID_2026_2027);

  const withPhoto = scraped.filter((r) => r.photoUrl !== null);
  const silhouettes = scraped.length - withPhoto.length;

  const clubs = await prisma.club.findMany({ select: { shortName: true, externalIds: true } });
  const shortNameBySlug = new Map<string, string>();
  for (const c of clubs) {
    const slug = (c.externalIds as Record<string, string> | null)?.lnh;
    if (slug) shortNameBySlug.set(slug.toLowerCase(), c.shortName);
  }

  const rows: PlayerPhotoRow[] = withPhoto.flatMap((r) => {
    const club = shortNameBySlug.get(r.lnhClubSlug.toLowerCase());
    if (!club) return [];
    return [{ nom: r.lastName, prenom: r.firstName, club, photoUrl: r.photoUrl! }];
  });

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

  console.log(`Scrapé lnh.fr : ${scraped.length} joueurs, ${withPhoto.length} avec vraie photo, ${silhouettes} silhouettes`);
  console.log(`Lignes résolues à un club : ${rows.length}`);
  console.log(`À mettre à jour : ${updates.length} | inchangés : ${unchanged.length} | non rapprochés : ${unmatched.length}`);
  console.log("");
  for (const u of updates) {
    console.log(`  MAJ  ${u.firstName} ${u.lastName} (${u.clubShortName})  ${u.oldPhotoUrl ? "[remplace] " : "[nouveau] "}${u.newPhotoUrl}`);
  }
  if (unmatched.length) {
    console.log("");
    for (const u of unmatched) {
      console.log(`  ???  ${u.row.prenom} ${u.row.nom} (${u.row.club})  — ${u.reason}`);
    }
  }

  if (!APPLY) {
    console.log("\n(dry-run — relancer avec --apply pour écrire)");
  } else if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) => prisma.player.update({ where: { id: u.playerId }, data: { photoUrl: u.newPhotoUrl } })),
    );
    console.log(`\n✅ ${updates.length} photos appliquées.`);
  } else {
    console.log("\nRien à appliquer.");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
