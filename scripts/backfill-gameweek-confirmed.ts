import { PrismaClient } from '@prisma/client';

// Backfille Gameweek.confirmedAt (migration 20260911120000_add_gameweek_confirmed_at)
// pour les journées déjà scorées dont la fenêtre de correction LNH est passée —
// sans ça, une journée jouée AVANT ce déploiement resterait éternellement
// "provisoire" (le cron corrections du mardi ne regarde que les 2 dernières
// journées notées).
//
// Critère : journée isScored dont le dernier match FINISHED remonte à plus de
// CONFIRM_AGE_DAYS jours (fenêtre LNH ~2-3 j — constaté ~48h, ARCHITECTURE.md §4.3).
// confirmedAt posé à la date du dernier match + CONFIRM_AGE_DAYS.
//
//   --dry           prévisualise sans écrire
//   --days N        change le seuil (défaut 3)
//   --gameweek N    force la confirmation de la journée N (ignore le seuil d'âge) —
//                   pour une journée dont on sait la fenêtre de correction passée
//                   (ex: le cron corrections du mardi a déjà tourné avant ce code).
//
// À exécuter une fois en prod après le déploiement de la migration (voir memory
// prod_database_access pour PROD_DATABASE_URL).
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const daysArg = argv.indexOf('--days');
const CONFIRM_AGE_DAYS = daysArg !== -1 ? Number(argv[daysArg + 1]) : 3;
const gwArg = argv.indexOf('--gameweek');
const FORCE_GAMEWEEK = gwArg !== -1 ? Number(argv[gwArg + 1]) : null;

const url = process.env.PROD_DATABASE_URL;
if (!url) {
  console.error(
    'PROD_DATABASE_URL manquant. Récupérer via:\n' +
      '  railway variables --service Postgres --kv | grep DATABASE_PUBLIC_URL\n' +
      'puis: PROD_DATABASE_URL="<url>?sslmode=require" npx tsx scripts/backfill-gameweek-confirmed.ts [--dry]'
  );
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });
const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const now = Date.now();
  const gameweeks = await prisma.gameweek.findMany({
    where: { isScored: true, confirmedAt: null, season: { isActive: true } },
    select: {
      id: true,
      number: true,
      matches: { select: { kickoffAt: true, status: true } },
    },
    orderBy: { number: 'asc' },
  });

  let confirmed = 0;
  for (const gw of gameweeks) {
    const finishedKickoffs = gw.matches
      .filter((m) => m.status === 'FINISHED')
      .map((m) => m.kickoffAt.getTime());
    if (finishedKickoffs.length === 0) continue;
    const lastKickoff = Math.max(...finishedKickoffs);
    const forced = FORCE_GAMEWEEK === gw.number;
    if (!forced && now - lastKickoff < CONFIRM_AGE_DAYS * DAY) {
      console.log(`J${gw.number} : dernier match trop récent, laissé provisoire.`);
      continue;
    }
    const confirmedAt = forced ? new Date() : new Date(lastKickoff + CONFIRM_AGE_DAYS * DAY);
    console.log(`J${gw.number} → confirmedAt = ${confirmedAt.toISOString()}${DRY ? ' (dry)' : ''}`);
    if (!DRY) {
      await prisma.gameweek.update({ where: { id: gw.id }, data: { confirmedAt } });
    }
    confirmed++;
  }

  console.log(`\n${confirmed} journée(s) ${DRY ? 'à confirmer' : 'confirmée(s)'}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
