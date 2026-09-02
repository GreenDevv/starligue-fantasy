// Aligne le nom de quelques joueurs sur la forme courte utilisée par lnh.fr
// (source canonique du roster) — ils EXISTENT déjà en base sous un nom plus long,
// ce qui empêchait le rapprochement des photos lnh.fr. Aucune création de joueur.
//
// Dry-run par défaut ; `--apply` pour écrire. Base = DATABASE_URL de l'env.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

// currentLastName (en base) → forme lnh.fr, restreint au club pour éviter tout faux positif
const RENAMES: { club: string; firstName: string; from: string; to: string }[] = [
  { club: "CAEN", firstName: "Tomas", from: "SIMOES VALENTE ESTEVAO VAN-ZELLER", to: "VAN-ZELLER" },
  { club: "FENIX", firstName: "Ernest", from: "PINEAU-ROSSI", to: "PINEAU" },
];

async function main() {
  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) throw new Error("NO_SEASON");

  for (const r of RENAMES) {
    const p = await prisma.player.findFirst({
      where: {
        seasonId: season.id,
        firstName: r.firstName,
        lastName: r.from,
        club: { shortName: r.club },
      },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!p) {
      console.log(`SKIP  ${r.firstName} ${r.from} (${r.club}) — introuvable (déjà renommé ?)`);
      continue;
    }
    console.log(`${APPLY ? "MAJ  " : "DRY  "}${p.firstName} ${p.lastName}  →  ${p.firstName} ${r.to}  (${r.club})`);
    if (APPLY) {
      await prisma.player.update({ where: { id: p.id }, data: { lastName: r.to } });
    }
  }

  if (!APPLY) console.log("\n(dry-run — relancer avec --apply)");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
