// Seed / rafraîchissement de l'annuaire des clubs FFHandball — ARCHITECTURE.md §23.4.
//
// Scrape monclub.ffhandball.fr (~2300 fiches, 8-12 min) et upsert la table
// HandballClub. Lancé :
//   - une fois à la main pour le seed initial de la prod ;
//   - tous les mois par .github/workflows/cron-monthly.yml (job sync-handball-clubs,
//     qui l'exécute sur le runner CI — PAS via une route /api/cron/*, 2300 fetch
//     séquencés dépassant le timeout serverless ; même approche que
//     backfill-warmup-logos).
//
// Requiert DATABASE_URL dans l'environnement — on refuse de tourner sans, pour ne
// jamais retomber en silence sur une autre base (piège du 2026-07-28, cf. mémoire
// `prod_database_access`). Le workflow le fournit depuis secrets.PROD_DATABASE_URL.
//   Prod manuel : railway run npx tsx scripts/run-ffhandball-clubs-import.ts
//   Smoke local : DATABASE_URL="postgresql://localhost:5432/starligue_fantasy" \
//                 npx tsx scripts/run-ffhandball-clubs-import.ts --limit 20
//
// Options : --limit N (n'importer que les N premiers clubs), --concurrency N (défaut 4).

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL manquant. En prod : `railway run npx tsx scripts/run-ffhandball-clubs-import.ts`.\n" +
      'En local : DATABASE_URL="postgresql://localhost:5432/starligue_fantasy" npx tsx scripts/run-ffhandball-clubs-import.ts --limit 20',
  );
  process.exit(1);
}

import { syncFfhandballClubs } from "../src/lib/ingestion/handball-clubs";
import { prisma } from "../src/lib/db";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const limit = arg("--limit") ? Number(arg("--limit")) : undefined;
  const concurrency = arg("--concurrency") ? Number(arg("--concurrency")) : undefined;

  console.log(
    `[ffhandball-clubs] démarrage${limit ? ` (limite ${limit})` : ""}, concurrence ${concurrency ?? 4}…`,
  );
  const startedAt = Date.now();

  const result = await syncFfhandballClubs({
    limit,
    concurrency,
    onProgress: (done, total) => {
      if (done % 100 === 0 || done === total) {
        console.log(`[ffhandball-clubs] ${done}/${total}`);
      }
    },
  });

  const seconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    JSON.stringify(
      {
        durationSeconds: seconds,
        scanned: result.scanned,
        created: result.created,
        updated: result.updated,
        failed: result.failed,
        failuresSample: result.failures.slice(0, 20),
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();

  // Un run où RIEN n'a été importé (échec réseau global, sitemap vide) doit faire
  // échouer le job CI ; quelques fiches KO sur 2300 sont tolérées.
  if (result.created + result.updated === 0) {
    console.error("[ffhandball-clubs] aucun club importé — échec");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
