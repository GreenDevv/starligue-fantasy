// Aligne « MONTE DOS SANTOS Hugo » (MHB) sur le nom affiché par lnh.fr depuis J3,
// « MONTE Bryan » — même joueur (photo lnh.fr `monte-dos-santos-hugo__picture…`,
// profil daikin-starligue/joueurs/bryan-monte). Depuis le renommage côté LNH, ses
// notes n'étaient plus rapprochées : J2 figée à 16.2 (LNH a corrigé en 19.2), J3
// 13.4 et J4 21.1 jamais enregistrées. Même principe que align-player-names-lnh.ts
// (lnh.fr = source canonique, aucune création de joueur).
//
// Dry-run par défaut ; `--apply` pour écrire. Base = DATABASE_URL de l'env.
// Ensuite : /admin/lnh-corrections sur J1, J2, J3 pour rattraper ses notes (et
// celles de GARCIANDIA A. / GARCIAS JOSÉ / WENKEGHEU TCHAMBOU, cf. PR #61).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) throw new Error("NO_SEASON");

  const p = await prisma.player.findFirst({
    where: { seasonId: season.id, lastName: "MONTE DOS SANTOS", firstName: "Hugo", club: { shortName: "MHB" } },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!p) {
    console.log("SKIP  MONTE DOS SANTOS Hugo (MHB) — introuvable (déjà renommé ?)");
  } else {
    console.log(`${APPLY ? "MAJ  " : "DRY  "}${p.firstName} ${p.lastName}  →  Bryan MONTE  (MHB, ${p.id})`);
    if (APPLY) await prisma.player.update({ where: { id: p.id }, data: { lastName: "MONTE", firstName: "Bryan" } });
  }

  if (!APPLY) console.log("\n(dry-run — relancer avec --apply)");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
