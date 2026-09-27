// Rattache tous les joueurs lnh.fr de la saison à leur Player via le slug de profil
// lnh.fr (Player.externalIds.lnh_slug / lnh_name), cf. src/lib/ingestion/lnh-roster-identity-sync.ts.
//
// Dry-run par défaut ; `--apply` écrit les identités ; `--create-missing` crée en plus
// les joueurs lnh.fr absents de l'effectif, valorisés d'après leur Score LNH de la
// saison (valueNewcomersFromSeasonScores).
// Base = DATABASE_URL de l'env.
import { syncLnhRosterIdentities } from "../src/lib/ingestion/lnh-roster-identity-sync";
import { prisma } from "../src/lib/db";

const APPLY = process.argv.includes("--apply");
const CREATE = process.argv.includes("--create-missing");

async function main() {
  const r = await syncLnhRosterIdentities({ apply: APPLY, createMissing: CREATE });
  const clubs = new Map((await prisma.club.findMany({ select: { id: true, shortName: true } })).map((c) => [c.id, c.shortName]));

  console.log(`Joueurs lnh.fr : ${r.lnhPlayers}`);
  console.log(`Rapprochés : slug ${r.matched.slug} · nom lnh ${r.matched.lnh_name} · nom ${r.matched.name} · photo ${r.matched.photo}`);
  console.log(`Identités ${APPLY ? "écrites" : "à écrire"} : ${r.identitiesWritten}`);
  console.log(`\nRenommés par la LNH (${r.renamedByLnh.length}) :`);
  for (const x of r.renamedByLnh) console.log(`  ${x.ours}  →  lnh « ${x.lnh} »  (${x.slug})`);
  console.log(`\nClub différent chez lnh.fr (${r.clubChanges.length}) :`);
  for (const x of r.clubChanges) console.log(`  ${x.name} : ${clubs.get(x.ourClubId)} → ${clubs.get(x.lnhClubId)}`);
  console.log(`\nConflits (${r.conflicts.length}) :`);
  for (const c of r.conflicts) console.log(`  ${c}`);
  console.log(`\nAbsents de l'effectif (${r.missing.length})${CREATE && APPLY ? ` — ${r.created} créés` : ""} :`);
  for (const m of [...r.missing].sort((a, b) => b.marketValue - a.marketValue))
    console.log(`  ${m.marketValue.toFixed(1).padStart(4)} M  ${m.club.padEnd(9)} ${m.position.padEnd(3)} ${m.name}  (${m.matchesPlayed} m, total ${m.totalScore})`);
  if (r.unknownClubs.length) console.log(`\nClubs lnh.fr inconnus : ${r.unknownClubs.join(", ")}`);
  if (!APPLY) console.log("\n(dry-run — relancer avec --apply)");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
