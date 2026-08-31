// Backfill ponctuel : récupère le logo des clubs d'origine qui avaient déjà
// des managers AVANT l'introduction de src/lib/clubs/handball-club-logo.ts
// (qui ne se déclenche que pour un nouveau choix de club à partir de son
// déploiement). Sans ce script, ces clubs-là resteraient sans logo tant que
// personne ne re-choisit son club — ARCHITECTURE.md §23.
//
// Idempotent (réutilise ensureHandballClubLogo, qui saute tout club ayant déjà
// un logoUrl) — se relance sans risque.
//   Prod : railway run npx tsx scripts/backfill-handball-club-logos.ts
//   Smoke local : DATABASE_URL="postgresql://localhost:5432/starligue_fantasy" \
//                 npx tsx scripts/backfill-handball-club-logos.ts --limit 20

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL manquant. En prod : `railway run npx tsx scripts/backfill-handball-club-logos.ts`.\n" +
      'En local : DATABASE_URL="postgresql://localhost:5432/starligue_fantasy" npx tsx scripts/backfill-handball-club-logos.ts --limit 20',
  );
  process.exit(1);
}

import { prisma } from "../src/lib/db";
import { ensureHandballClubLogo } from "../src/lib/clubs/handball-club-logo";
import { mapWithConcurrency } from "../src/lib/data-providers/ffhandball-clubs.provider";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const limit = arg("--limit") ? Number(arg("--limit")) : undefined;

  const clubs = await prisma.handballClub.findMany({
    where: { source: "FFHANDBALL", logoUrl: null, members: { some: {} } },
    select: { id: true, name: true },
    ...(limit ? { take: limit } : {}),
  });
  console.log(`${clubs.length} club(s) avec au moins un manager, sans logo.`);

  let fetched = 0;
  await mapWithConcurrency(clubs, 4, async (club, i) => {
    await ensureHandballClubLogo(club.id);
    const updated = await prisma.handballClub.findUnique({ where: { id: club.id }, select: { logoUrl: true } });
    if (updated?.logoUrl) fetched++;
    console.log(`[${i + 1}/${clubs.length}] ${club.name} → ${updated?.logoUrl ? "logo trouvé" : "pas de logo"}`);
  });

  console.log(JSON.stringify({ scanned: clubs.length, fetched, noLogo: clubs.length - fetched }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
