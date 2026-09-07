import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { rankTeams, type RankableTeam } from '../src/lib/standings/fantasy-rank';
import { SIMULATION_SEASON_LABEL } from '../src/lib/simulation/constants';

// Backfille FantasyStandingSnapshot (migration 20260903192737_add_fantasy_standing_snapshot)
// pour toutes les journées déjà notées — live (saison active) ET simulation
// (jusqu'au curseur Season.currentSimulationGameweekNumber). Sans ça, l'évolution
// ▲/▼ du récap de journée n'a aucun rang de référence pour l'historique déjà joué.
//
// Rejoue la MÊME logique que src/lib/standings/snapshot-fantasy-standings.ts
// (cumul par journée − pointsConverted courant, rankTeams pur partagé), en upsert
// idempotent. `pointsConverted` est pris à sa valeur courante (historique daté non
// reconstituable) — écart négligeable, cf. commentaire du module.
//
// À exécuter UNE fois en prod juste après le déploiement de la migration (jamais en
// local, voir memory prod_database_access pour PROD_DATABASE_URL).
const url = process.env.PROD_DATABASE_URL;
if (!url) {
  console.error(
    'PROD_DATABASE_URL manquant. Récupérer via:\n' +
      '  railway variables --service Postgres --kv | grep DATABASE_PUBLIC_URL\n' +
      'puis relancer avec PROD_DATABASE_URL="<url>?sslmode=require" npx tsx scripts/backfill-fantasy-standing-snapshots.ts'
  );
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

const round1 = (n: number) => Math.round(n * 10) / 10;

async function upsertSnapshot(
  seasonId: string,
  mode: 'LIVE' | 'SIMULATION',
  gameweekNumber: number,
  teams: RankableTeam[]
): Promise<number> {
  if (teams.length === 0) return 0;
  const ranked = rankTeams(teams);
  await prisma.$transaction(
    ranked.map((r) =>
      prisma.fantasyStandingSnapshot.upsert({
        where: { seasonId_mode_gameweekNumber_teamId: { seasonId, mode, gameweekNumber, teamId: r.teamId } },
        create: {
          seasonId,
          mode,
          gameweekNumber,
          teamId: r.teamId,
          leagueId: r.leagueId,
          globalRank: r.globalRank,
          leagueRank: r.leagueRank,
          cumulativePoints: new Decimal(r.cumulativePoints),
        },
        update: {
          leagueId: r.leagueId,
          globalRank: r.globalRank,
          leagueRank: r.leagueRank,
          cumulativePoints: new Decimal(r.cumulativePoints),
          capturedAt: new Date(),
        },
      })
    )
  );
  return ranked.length;
}

async function backfillLive() {
  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    console.log('Live : aucune saison active, ignoré.');
    return;
  }
  const scoredGameweeks = await prisma.gameweek.findMany({
    where: { seasonId: season.id, isScored: true },
    orderBy: { number: 'asc' },
    select: { number: true },
  });
  if (scoredGameweeks.length === 0) {
    console.log('Live : aucune journée notée, rien à backfiller.');
    return;
  }

  const teams = await prisma.fantasyTeam.findMany({
    where: { isValidated: true, league: { seasonId: season.id } },
    select: {
      id: true,
      leagueId: true,
      pointsConverted: true,
      lineups: {
        where: { points: { not: null } },
        select: { points: true, gameweek: { select: { number: true } } },
      },
    },
  });

  for (const { number } of scoredGameweeks) {
    const rankable: RankableTeam[] = teams.map((t) => {
      const raw = t.lineups
        .filter((l) => l.gameweek.number <= number)
        .reduce((s, l) => s + Number(l.points ?? 0), 0);
      return { teamId: t.id, leagueId: t.leagueId, cumulativePoints: round1(raw - Number(t.pointsConverted)) };
    });
    const count = await upsertSnapshot(season.id, 'LIVE', number, rankable);
    console.log(`Live J${number} : ${count} équipe(s) snapshotée(s).`);
  }
}

async function backfillSimulation() {
  const target = await prisma.season.findUnique({ where: { label: SIMULATION_SEASON_LABEL } });
  if (!target || target.currentSimulationGameweekNumber <= 0) {
    console.log('Simulation : curseur à 0 (ou saison absente), rien à backfiller.');
    return;
  }

  const teams = await prisma.simulationTeam.findMany({
    where: { isValidated: true, seasonId: target.id },
    select: {
      id: true,
      leagueId: true,
      pointsConverted: true,
      lineups: {
        where: { points: { not: null } },
        select: { points: true, gameweek: { select: { number: true } } },
      },
    },
  });

  for (let number = 1; number <= target.currentSimulationGameweekNumber; number++) {
    const rankable: RankableTeam[] = teams.map((t) => {
      const raw = t.lineups
        .filter((l) => l.gameweek.number <= number)
        .reduce((s, l) => s + Number(l.points ?? 0), 0);
      return { teamId: t.id, leagueId: t.leagueId, cumulativePoints: round1(raw - Number(t.pointsConverted)) };
    });
    const count = await upsertSnapshot(target.id, 'SIMULATION', number, rankable);
    console.log(`Simulation J${number} : ${count} équipe(s) snapshotée(s).`);
  }
}

async function main() {
  await backfillLive();
  await backfillSimulation();
  console.log('Terminé.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
