/**
 * Affiche le numéro de la dernière journée de la saison active qui est notée ET
 * confirmée (Gameweek.confirmedAt posé par le cron des corrections LNH du mardi,
 * cf. src/lib/lnh-corrections/cron.ts) — c.-à-d. dont les notes ne bougeront plus.
 * Rien (sortie vide) si aucune. Utilisé par generate.mjs --auto.
 */
import { prisma } from "@/lib/db";

async function main() {
  const gw = await prisma.gameweek.findFirst({
    where: { season: { isActive: true }, isScored: true, confirmedAt: { not: null } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  process.stdout.write(gw ? String(gw.number) : "");
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
