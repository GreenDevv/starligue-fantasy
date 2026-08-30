// Géocode les clubs saisis librement (source=MANUAL) qui ont une ville mais pas
// de coordonnées, via l'annuaire de villes embarqué (src/lib/geo/cities.ts).
// À lancer une fois après le déploiement de la feature « ville → point sur la
// carte » (§23.7).
//
//   railway run npx tsx scripts/backfill-handball-club-coords.ts          # prod
//   DATABASE_URL=postgresql://localhost:5432/starligue_fantasy npx tsx scripts/backfill-handball-club-coords.ts --dry
//
// Idempotent : ne touche que les clubs sans latitude. --dry n'écrit rien.
import { prisma } from "@/lib/db";
import { geocodeCity } from "@/lib/geo/cities";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL manquant — refus de tourner (cf. mémoire prod_database_access).");
  process.exit(1);
}

const dry = process.argv.includes("--dry");

async function main() {
  const clubs = await prisma.handballClub.findMany({
    where: { source: "MANUAL", latitude: null, city: { not: null } },
    select: { id: true, name: true, city: true, country: true },
  });
  console.log(`${clubs.length} club(s) MANUAL sans coordonnées avec une ville`);

  let hit = 0;
  for (const c of clubs) {
    const coords = geocodeCity(c.city as string, c.country);
    if (!coords) {
      console.log(`  ✗ ${c.name} (${c.city}, ${c.country}) — ville introuvable`);
      continue;
    }
    hit += 1;
    console.log(`  ✓ ${c.name} (${c.city}, ${c.country}) → ${coords.latitude}, ${coords.longitude}`);
    if (!dry) await prisma.handballClub.update({ where: { id: c.id }, data: coords });
  }
  console.log(`${dry ? "[dry] " : ""}${hit}/${clubs.length} géocodés`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
