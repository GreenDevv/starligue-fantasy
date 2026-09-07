import { prisma } from "@/lib/db";
import { recomputeCatchupCredits } from "@/lib/scoring/recompute-catchup";

// Points d'accueil (ARCHITECTURE.md §13.7) — backfill unique en prod après le
// déploiement de la migration 20260907150000_add_lineup_is_catchup.
//
// Crée les lignes FantasyLineup.isCatchup pour toute équipe déjà validée qui a
// rejoint sa ligue APRÈS une journée déjà notée : sans ça elle reste à 0 pt sur
// ces journées et hors course au cumul. Idempotent (recomputeCatchupCredits fait
// delete-puis-create) — rejouable sans risque, et de toute façon rejoué à la fin
// de chaque prochaine journée notée par computeGameweekScores.
//
// Requiert DATABASE_URL = URL Railway prod (?sslmode=require) — cf. memory
// prod_database_access, piège base locale.
//   DATABASE_URL="<prod>?sslmode=require" npx tsx scripts/backfill-catchup-credits.ts
//
// Option `--factor <x>` : upsert `CATCHUP_FACTOR` dans GameConfig AVANT le recalcul
// (sert à changer le facteur en prod puis recréditer l'existant en une passe).
//   ... npx tsx scripts/backfill-catchup-credits.ts --factor 0.5

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!/rlwy\.net|proxy\.rlwy|railway/.test(dbUrl)) {
    console.error(
      "DATABASE_URL ne ressemble pas à la prod Railway. Refus (piège base locale, cf. memory prod_database_access).\n" +
        `  DATABASE_URL="${dbUrl.slice(0, 40)}..."`
    );
    process.exit(1);
  }

  const factorIdx = process.argv.indexOf("--factor");
  if (factorIdx !== -1) {
    const raw = process.argv[factorIdx + 1];
    const factor = Number(raw);
    if (!Number.isFinite(factor) || factor < 0) {
      console.error(`--factor invalide : "${raw}"`);
      process.exit(1);
    }
    await prisma.gameConfig.upsert({
      where: { key: "CATCHUP_FACTOR" },
      update: { value: String(factor) },
      create: { key: "CATCHUP_FACTOR", value: String(factor) },
    });
    console.log(`  ✓ GameConfig CATCHUP_FACTOR = ${factor}`);
  }

  const seasons = await prisma.season.findMany({
    where: { isActive: true },
    select: { id: true, label: true },
  });
  for (const s of seasons) {
    const res = await recomputeCatchupCredits(s.id);
    console.log(
      `  ✓ ${s.label} — ${res.teamsWithCredits} équipe(s) créditée(s), ${res.creditRows} ligne(s) d'accueil`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
