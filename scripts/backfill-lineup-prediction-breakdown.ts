import { PrismaClient, type Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { computeLineupPoints, parseScoringConfig, type LineupEntry } from '../src/lib/scoring/engine';
import { computeStatLeaderBonuses, type StatLeaderPlayerInput } from '../src/lib/scoring/stat-leaders';
import { resolveOutcome, type PredictionOutcome } from '../src/lib/predictions/outcome';
import { computeGameweekMultiplier, parseMultiplierConfig } from '../src/lib/predictions/multiplier';

// Backfille FantasyLineup.rawPoints/predictionMultiplier (ajoutés par la migration
// 20260901120000_add_lineup_prediction_breakdown) pour tous les lineups déjà
// scorés — sans quoi le détail du classement général (points d'effectif vs apport
// des pronostics) resterait vide pour toute la saison déjà jouée. Rejoue la même
// logique que computeGameweekScores (src/lib/scoring/compute.ts) mais SANS
// toucher `points`/totalPoints/valorisation : uniquement les deux nouvelles
// colonnes, en garde-fou si un écart avec `points` déjà stocké est détecté (log,
// jamais d'écrasement silencieux d'un total historique).
//
// À exécuter une fois en prod juste après le déploiement de la migration (jamais
// en local, voir memory prod_database_access pour PROD_DATABASE_URL).
const url = process.env.PROD_DATABASE_URL;
if (!url) {
  console.error(
    'PROD_DATABASE_URL manquant. Récupérer via:\n' +
      '  railway variables --service Postgres --kv | grep DATABASE_PUBLIC_URL\n' +
      'puis relancer avec PROD_DATABASE_URL="<url>?sslmode=require" npx tsx scripts/backfill-lineup-prediction-breakdown.ts'
  );
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

interface LineupEntryJson {
  playerId: string;
  position: string;
  role: 'STARTER' | 'BENCH';
  purchasePrice: number;
  isCaptain?: boolean;
}

async function main() {
  const configs = await prisma.gameConfig.findMany();
  const rawConfig = Object.fromEntries(configs.map((c) => [c.key, c.value]));
  const scoringConfig = parseScoringConfig(rawConfig);
  const multiplierConfig = parseMultiplierConfig(rawConfig);

  const gameweeks = await prisma.gameweek.findMany({
    where: { isScored: true },
    select: { id: true, number: true },
    orderBy: { number: 'asc' },
  });

  let totalUpdated = 0;
  let totalMismatch = 0;

  for (const gw of gameweeks) {
    const lineups = await prisma.fantasyLineup.findMany({
      where: { gameweekId: gw.id, points: { not: null }, rawPoints: null },
      select: { id: true, fantasyTeamId: true, entries: true, bonus: true, points: true },
    });
    if (lineups.length === 0) continue;

    const matches = await prisma.match.findMany({
      where: { gameweekId: gw.id },
      include: { playerStats: true },
    });

    const playerIds = [...new Set(matches.flatMap((m) => m.playerStats.map((s) => s.playerId)))];
    const players = await prisma.player.findMany({
      where: { id: { in: playerIds } },
      select: { id: true, clubId: true },
    });
    const clubByPlayer = new Map(players.map((p) => [p.id, p.clubId]));

    const statsByPlayer = new Map<string, { lnhRating: number | null; played: boolean; teamWon: boolean }>();
    for (const match of matches) {
      const homeWon = match.homeScore !== null && match.awayScore !== null && match.homeScore > match.awayScore;
      const awayWon = match.homeScore !== null && match.awayScore !== null && match.awayScore > match.homeScore;
      for (const stat of match.playerStats) {
        const clubId = clubByPlayer.get(stat.playerId);
        const teamWon = clubId === match.homeClubId ? homeWon : clubId === match.awayClubId ? awayWon : false;
        statsByPlayer.set(stat.playerId, {
          lnhRating: stat.lnhRating ? Number(stat.lnhRating) : null,
          played: stat.played,
          teamWon,
        });
      }
    }

    const statLeaderRows: StatLeaderPlayerInput[] = matches.flatMap((match) =>
      match.playerStats.map((stat) => ({
        playerId: stat.playerId,
        played: stat.played,
        goalsPlay: stat.goalsPlay,
        goalsPenalty: stat.goalsPenalty,
        goalsTotal: stat.goalsTotal,
        shotPercentage: stat.shotPercentage !== null ? Number(stat.shotPercentage) : null,
        assists: stat.assists,
        ballsRecovered: stat.ballsRecovered,
        opponentShotsBlocked: stat.opponentShotsBlocked,
        penaltiesDrawn: stat.penaltiesDrawn,
        twoMinDrawn: stat.twoMinDrawn,
        neutralizations: stat.neutralizations,
        saves: stat.saves,
        savePercentage: stat.savePercentage !== null ? Number(stat.savePercentage) : null,
        turnovers: stat.turnovers,
        twoMinTaken: stat.twoMinTaken,
        disqualified: stat.disqualified,
      }))
    );
    const statBonusByPlayer = computeStatLeaderBonuses(statLeaderRows, {
      enabled: scoringConfig.statLeaderBonusEnabled,
      bonusPoints: scoringConfig.statLeaderBonusPoints,
      malusPoints: scoringConfig.statLeaderMalusPoints,
    });

    const predictionMarkets = await prisma.predictionMarket.findMany({
      where: { matchId: { in: matches.map((m) => m.id) } },
      select: { id: true, matchId: true },
    });
    const actualOutcomeByMarketId = new Map<string, PredictionOutcome | null>();
    for (const market of predictionMarkets) {
      const match = matches.find((m) => m.id === market.matchId)!;
      actualOutcomeByMarketId.set(
        market.id,
        match.homeScore !== null && match.awayScore !== null ? resolveOutcome(match.homeScore, match.awayScore) : null
      );
    }
    const marketIds = predictionMarkets.map((m) => m.id);

    const updates: Prisma.PrismaPromise<unknown>[] = [];

    for (const lineup of lineups) {
      const entries = lineup.entries as unknown as LineupEntryJson[];
      const lineupInputs: LineupEntry[] = entries.map((e) => {
        const stat = statsByPlayer.get(e.playerId);
        return {
          lnhRating: stat?.lnhRating ?? null,
          played: stat?.played ?? false,
          role: e.role,
          teamWon: stat?.teamWon ?? false,
          isCaptain: e.isCaptain ?? false,
          statBonusPoints: statBonusByPlayer.get(e.playerId) ?? 0,
        };
      });
      const rawPoints = computeLineupPoints(lineupInputs, scoringConfig, lineup.bonus);

      const teamPredictions = marketIds.length
        ? await prisma.prediction.findMany({
            where: { fantasyTeamId: lineup.fantasyTeamId, marketId: { in: marketIds } },
            select: { marketId: true, outcome: true },
          })
        : [];
      const attempts = teamPredictions
        .map((p) => {
          const actual = actualOutcomeByMarketId.get(p.marketId);
          return actual ? { correct: actual === p.outcome } : null;
        })
        .filter((a): a is { correct: boolean } => a !== null);
      const multiplier = computeGameweekMultiplier(attempts, multiplierConfig);

      const expectedPoints = rawPoints <= 0 ? rawPoints : Math.round(rawPoints * multiplier * 10) / 10;
      const storedPoints = Number(lineup.points);
      if (Math.abs(expectedPoints - storedPoints) > 0.05) {
        // Écart avec le total déjà en base (ex: correction manuelle après coup) —
        // on backfille quand même rawPoints/multiplier (le detail reste cohérent
        // avec la formule), mais on log pour vérif manuelle éventuelle.
        totalMismatch++;
        console.warn(
          `J${gw.number} lineup ${lineup.id}: recalcul ${expectedPoints} ≠ stocké ${storedPoints} (écart ${(expectedPoints - storedPoints).toFixed(1)})`
        );
      }

      updates.push(
        prisma.fantasyLineup.update({
          where: { id: lineup.id },
          data: { rawPoints: new Decimal(rawPoints), predictionMultiplier: new Decimal(multiplier) },
        })
      );
    }

    if (updates.length > 0) {
      await prisma.$transaction(updates);
      totalUpdated += updates.length;
      console.log(`J${gw.number} : ${updates.length} lineup(s) backfillé(s).`);
    }
  }

  console.log(`Terminé : ${totalUpdated} lineup(s) backfillé(s), ${totalMismatch} écart(s) détecté(s) et loggé(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
