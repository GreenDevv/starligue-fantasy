// compute-scores — ARCHITECTURE.md §4.1, §2.3
// Rejouable : efface et recalcule les points d'une journée complète.

import { prisma } from "@/lib/db";
import { computeLineupPoints, parseScoringConfig, type LineupEntry } from "./engine";
import { computeStatLeaderBonuses, type StatLeaderPlayerInput } from "./stat-leaders";
import { applyGameweekValueAdjustments } from "@/lib/players/apply-value-adjustment";
import { resolveOutcome, type PredictionOutcome } from "@/lib/predictions/outcome";
import { computeGameweekMultiplier, applyMultiplier, parseMultiplierConfig } from "@/lib/predictions/multiplier";
import { Decimal } from "@prisma/client/runtime/library";

interface LineupEntryJson {
  playerId: string;
  position: string;
  role: "STARTER" | "BENCH";
  purchasePrice: number;
  isCaptain?: boolean;
}

/**
 * Calcule (ou recalcule) les points de tous les lineups snapshotés pour une journée.
 * §4.1 : appelé après que toutes les notes LNH d'une journée sont disponibles.
 * Lance une erreur si des matchs de la journée n'ont pas encore de résultat.
 */
export async function computeGameweekScores(gameweekId: string): Promise<{ lineupCount: number }> {
  const gameweek = await prisma.gameweek.findUniqueOrThrow({
    where: { id: gameweekId },
    include: {
      matches: {
        include: {
          playerStats: true,
          homeClub: true,
          awayClub: true,
        },
      },
      lineups: true,
    },
  });

  // Vérifie que tous les matchs ont des scores (au moins 1 stat joueur par match)
  const unscored = gameweek.matches.filter((m) => m.playerStats.length === 0);
  if (unscored.length > 0) {
    throw new Error(
      `${unscored.length} match(s) sans notes sur la journée ${gameweek.number}`,
    );
  }

  // Valeur marchande dynamique : ajustée une seule fois par journée (idempotent),
  // indépendamment du calcul des points ci-dessous.
  await applyGameweekValueAdjustments(gameweekId);

  // Charge la config de scoring depuis GameConfig
  const configs = await prisma.gameConfig.findMany();
  const rawConfig = Object.fromEntries(configs.map((c) => [c.key, c.value]));
  const scoringConfig = parseScoringConfig(rawConfig);

  // Index : playerId → { lnhRating, played, teamWon }
  const statsByPlayer = new Map<
    string,
    { lnhRating: number | null; played: boolean; teamWon: boolean }
  >();

  for (const match of gameweek.matches) {
    const homeWon =
      match.homeScore !== null &&
      match.awayScore !== null &&
      match.homeScore > match.awayScore;
    const awayWon =
      match.homeScore !== null &&
      match.awayScore !== null &&
      match.awayScore > match.homeScore;

    for (const stat of match.playerStats) {
      // Détermine si le club du joueur a gagné — on cherche dans home/away clubs
      // via la relation player → club (chargée plus bas au besoin)
      statsByPlayer.set(stat.playerId, {
        lnhRating: stat.lnhRating ? Number(stat.lnhRating) : null,
        played: stat.played,
        // On résoudra teamWon après avoir chargé le club du joueur
        teamWon: false, // placeholder
      });
    }

    // Résout teamWon pour chaque stat de ce match
    for (const stat of match.playerStats) {
      const player = await prisma.player.findUnique({
        where: { id: stat.playerId },
        select: { clubId: true },
      });
      if (!player) continue;
      const teamWon =
        player.clubId === match.homeClubId ? homeWon : awayWon;
      statsByPlayer.set(stat.playerId, {
        ...statsByPlayer.get(stat.playerId)!,
        teamWon,
      });
    }
  }

  // Bonus/malus "leader de journée" (src/lib/scoring/stat-leaders.ts) — calculé une
  // seule fois pour toute la journée (tous clubs confondus), pas par lineup.
  const statLeaderRows: StatLeaderPlayerInput[] = gameweek.matches.flatMap((match) =>
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

  // Multiplicateur de pronostics (ARCHITECTURE.md §14) : bande gagnante réelle de
  // chaque match de la journée qui a un marché de pronostic, indexée par marketId —
  // calculée une seule fois pour toute la journée, pas par équipe.
  const predictionMarkets = await prisma.predictionMarket.findMany({
    where: { matchId: { in: gameweek.matches.map((m) => m.id) } },
    select: { id: true, matchId: true },
  });
  const actualOutcomeByMarketId = new Map<string, PredictionOutcome | null>();
  for (const market of predictionMarkets) {
    const match = gameweek.matches.find((m) => m.id === market.matchId)!;
    actualOutcomeByMarketId.set(
      market.id,
      match.homeScore !== null && match.awayScore !== null
        ? resolveOutcome(match.homeScore, match.awayScore)
        : null,
    );
  }
  const marketIds = predictionMarkets.map((m) => m.id);
  const multiplierConfig = parseMultiplierConfig(rawConfig);

  // Calcule les points pour chaque lineup snapshoté
  let lineupCount = 0;
  for (const lineup of gameweek.lineups) {
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

    // Pronostics de cette équipe sur les matchs de la journée → multiplicateur
    // appliqué aux points positifs (§14 : jamais sur du négatif, jamais pénalisant
    // si aucun pronostic n'a été tenté).
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
    const points = applyMultiplier(rawPoints, multiplier);

    // rawPoints/predictionMultiplier persistés pour le détail du classement général
    // (points d'effectif vs apport des pronostics, par journée) — voir
    // /leaderboard/team/[teamId].
    await prisma.fantasyLineup.update({
      where: { id: lineup.id },
      data: {
        points: new Decimal(points),
        rawPoints: new Decimal(rawPoints),
        predictionMultiplier: new Decimal(multiplier),
      },
    });

    // Met à jour totalPoints de l'équipe
    await recalcTotalPoints(lineup.fantasyTeamId);

    lineupCount++;
  }

  // Marque la journée comme scorée si tous les lineups ont des points
  await prisma.gameweek.update({
    where: { id: gameweekId },
    data: { isScored: true },
  });

  return { lineupCount };
}

// totalPoints = Σ(lineup.points) - pointsConverted : la conversion points → budget
// (src/lib/budget/points-conversion.ts) retire définitivement des points du
// classement, et doit survivre à un recompute de journée qui recalcule tout depuis
// la table FantasyLineup — d'où la soustraction ici plutôt qu'un decrement ponctuel.
async function recalcTotalPoints(fantasyTeamId: string) {
  const [lineups, team] = await Promise.all([
    prisma.fantasyLineup.findMany({
      where: { fantasyTeamId, points: { not: null } },
      select: { points: true },
    }),
    prisma.fantasyTeam.findUniqueOrThrow({ where: { id: fantasyTeamId }, select: { pointsConverted: true } }),
  ]);
  const rawTotal = lineups.reduce((s, l) => s + Number(l.points ?? 0), 0);
  const total = rawTotal - Number(team.pointsConverted);
  await prisma.fantasyTeam.update({
    where: { id: fantasyTeamId },
    data: { totalPoints: new Decimal(Math.round(total * 10) / 10) },
  });
}
