import { PrismaClient } from '@prisma/client';

// Backfille FantasyTeam/SimulationTeam.lastPointsSeenGameweekNumber (ajouté par
// la migration 20260806120000_add_gameweek_recap_seen_marker) sur la dernière
// journée déjà notée à ce jour, pour les équipes existantes — sans ce backfill,
// le défaut Prisma à 0 ferait apparaître le GameweekRecapModal pour TOUTES les
// journées déjà notées de la saison à la prochaine visite de chaque utilisateur
// (voir src/lib/team/pending-gameweek-recap.ts). Seules les journées notées
// APRÈS ce script doivent déclencher un récap.
//
// À exécuter une fois en prod juste après le déploiement de la migration (avant
// le prochain compute-scores), jamais en local (voir memory prod_database_access
// pour comment récupérer PROD_DATABASE_URL).
const url = process.env.PROD_DATABASE_URL;
if (!url) {
  console.error(
    'PROD_DATABASE_URL manquant. Récupérer via:\n' +
      '  railway variables --service Postgres --kv | grep DATABASE_PUBLIC_URL\n' +
      'puis relancer avec PROD_DATABASE_URL="<url>?sslmode=require" npx tsx scripts/backfill-recap-seen-marker.ts'
  );
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  // Live : Gameweek.isScored est global par saison — une seule valeur par saison
  // suffit pour toutes les FantasyTeam de ses ligues.
  const seasons = await prisma.season.findMany({ select: { id: true, label: true } });

  for (const season of seasons) {
    const latestScored = await prisma.gameweek.findFirst({
      where: { seasonId: season.id, isScored: true },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    if (!latestScored) {
      console.log(`Saison ${season.label} : aucune journée notée, rien à backfiller.`);
      continue;
    }
    const result = await prisma.fantasyTeam.updateMany({
      where: { league: { seasonId: season.id }, lastPointsSeenGameweekNumber: { lt: latestScored.number } },
      data: { lastPointsSeenGameweekNumber: latestScored.number },
    });
    console.log(`Saison ${season.label} (live) : ${result.count} équipe(s) marquées jusqu'à J${latestScored.number}.`);
  }

  // Simulation : chaque équipe avance à son rythme (voir
  // pending-gameweek-recap.ts) — backfill par équipe sur son propre dernier
  // lineup scoré, pas un plafond global de saison.
  const simulationTeams = await prisma.simulationTeam.findMany({
    select: {
      id: true,
      lineups: {
        where: { points: { not: null } },
        orderBy: { gameweek: { number: 'desc' } },
        take: 1,
        select: { gameweek: { select: { number: true } } },
      },
    },
  });

  let simulationUpdated = 0;
  for (const team of simulationTeams) {
    const latest = team.lineups[0]?.gameweek.number;
    if (latest === undefined) continue;
    await prisma.simulationTeam.update({
      where: { id: team.id },
      data: { lastPointsSeenGameweekNumber: latest },
    });
    simulationUpdated++;
  }
  console.log(`Simulation : ${simulationUpdated}/${simulationTeams.length} équipe(s) backfillées.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
