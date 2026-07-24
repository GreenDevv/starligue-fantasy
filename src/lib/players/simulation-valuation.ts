// Valorisation dynamique en simulation — recalcule marketValue à chaque avancée
// OU retour en arrière admin (src/lib/simulation/admin-advance.ts), à partir du
// Score LNH cumulé DEPUIS LE DÉBUT de la saison rejouée (pas la saison précédente,
// contrairement au calcul pré-saison de src/lib/simulation/setup.ts).
// PlayerMatchStat.lnhRating stocke déjà le "Score LNH" match par match (voir
// src/lib/data-providers/lnh-scraper.provider.ts, row.score → lnhRating — le
// commentaire Prisma "/10" est trompeur), donc le cumul est dérivable des données
// déjà ingérées à chaque avancée, sans nouvelle source.
//
// Réconciliation complète (pas juste les joueurs avec des stats dans la plage) :
// un retour en arrière peut faire "disparaître" les seules stats d'un joueur (son
// premier match de la saison rejouée est justement celui qu'on annule) — ce joueur
// doit alors revenir à sa valorisation pré-saison (ou au placeholder s'il n'en a
// jamais eu). Repéré lors du nettoyage de résidus de test du 2026-07-20 : la
// version précédente ne touchait QUE les joueurs présents dans la plage, laissant
// des `marketValue` figées sur une valeur d'une avancée annulée.
//
// Le repli "pré-saison" est recalculé depuis PlayerLnhSeasonStat (donnée figée,
// écrite une seule fois par src/lib/simulation/setup.ts) plutôt que lu depuis
// PlayerValueHistory : un premier essai indexait sur `gameweekId: null`, mais un
// retour en arrière jusqu'à J0 écrit LUI AUSSI une ligne gameweekId=null (repli
// placeholder) — au cycle suivant cette ligne était relue comme si c'était la
// vraie valorisation pré-saison, figeant valuationPending à false à tort (bug
// trouvé en testant J0→J1→J2→J1→J0 en boucle, pas juste un aller-retour simple).
import { prisma } from "@/lib/db";
import { computeValuationsFromLnhScores, type PlayerLnhScoreInput } from "./valuation";
import type { Position } from "@/lib/squad/validation";

export interface CumulativeValuationResult {
  updatedCount: number;
  playersConsidered: number;
}

export async function applyCumulativeSimulationValuation(
  seasonId: string,
  uptoGameweekNumber: number
): Promise<CumulativeValuationResult> {
  // uptoGameweekNumber = 0 : pas de Gameweek "J0" en base — état pré-saison littéral,
  // tagué gameweekId=null dans l'historique (même convention que src/lib/simulation/setup.ts).
  const gameweek =
    uptoGameweekNumber > 0
      ? await prisma.gameweek.findUnique({ where: { seasonId_number: { seasonId, number: uptoGameweekNumber } } })
      : null;
  const gameweekId = gameweek?.id ?? null;

  const grouped = await prisma.playerMatchStat.groupBy({
    by: ["playerId"],
    where: {
      played: true,
      lnhRating: { not: null },
      match: { seasonId, gameweek: { number: { lte: uptoGameweekNumber } } },
    },
    _sum: { lnhRating: true },
    _count: { lnhRating: true },
  });

  const allPlayers = await prisma.player.findMany({
    where: { seasonId },
    select: { id: true, position: true, marketValue: true, valuationPending: true },
  });
  const withStatsIds = new Set(grouped.map((g) => g.playerId));

  const inputs: PlayerLnhScoreInput[] = grouped
    .map((g) => {
      const player = allPlayers.find((p) => p.id === g.playerId);
      if (!player || g._count.lnhRating === 0) return null;
      return { playerId: g.playerId, position: player.position as Position, avgLnhScore: Number(g._sum.lnhRating) / g._count.lnhRating };
    })
    .filter((x): x is PlayerLnhScoreInput => x !== null);
  const valuationById = new Map(computeValuationsFromLnhScores(inputs).map((v) => [v.playerId, v.marketValue]));

  // Joueurs sans stat dans [1..uptoGameweekNumber] : reviennent à leur valorisation
  // pré-saison, recalculée depuis PlayerLnhSeasonStat (figé par setup.ts, jamais
  // réécrit), sinon placeholder 7.0.
  const withoutStats = allPlayers.filter((p) => !withStatsIds.has(p.id));
  const preseasonStats =
    withoutStats.length > 0
      ? await prisma.playerLnhSeasonStat.findMany({
          where: { playerId: { in: withoutStats.map((p) => p.id) } },
          select: { playerId: true, avgLnhScore: true },
        })
      : [];
  const preseasonInputs: PlayerLnhScoreInput[] = preseasonStats
    .map((s) => {
      const player = allPlayers.find((p) => p.id === s.playerId);
      if (!player) return null;
      return { playerId: s.playerId, position: player.position as Position, avgLnhScore: Number(s.avgLnhScore) };
    })
    .filter((x): x is PlayerLnhScoreInput => x !== null);
  const preseasonByPlayer = new Map(computeValuationsFromLnhScores(preseasonInputs).map((v) => [v.playerId, v.marketValue]));

  const updates: { playerId: string; newValue: number; newPending: boolean }[] = [];
  const snapshots: { playerId: string; newValue: number }[] = [];
  for (const p of allPlayers) {
    const computed = valuationById.get(p.id);
    const newValue = computed ?? preseasonByPlayer.get(p.id) ?? 7.0;
    const newPending = computed === undefined && !preseasonByPlayer.has(p.id);
    snapshots.push({ playerId: p.id, newValue });
    if (newValue !== Number(p.marketValue) || newPending !== p.valuationPending) {
      updates.push({ playerId: p.id, newValue, newPending });
    }
  }

  // Un point d'historique par joueur pour CETTE journée, à chaque appel — y compris
  // quand la valeur ne bouge pas (le graphique doit avoir un point par journée
  // révélée, pas seulement quand ça change), et y compris si cette journée a déjà
  // été avancée puis annulée puis réavancée (re-jouer ne doit jamais empiler des
  // doublons : on supprime l'éventuel jeu de lignes existant pour ce gameweekId
  // avant de le recréer, plutôt qu'un create() nu qui les additionnait à l'infini —
  // bug réel observé lors de tests avance/retour en arrière répétés).
  await prisma.$transaction([
    ...updates.map(({ playerId, newValue, newPending }) =>
      prisma.player.update({ where: { id: playerId }, data: { marketValue: newValue, valuationPending: newPending } })
    ),
    prisma.playerValueHistory.deleteMany({
      where: { gameweekId, playerId: { in: allPlayers.map((p) => p.id) } },
    }),
    ...snapshots.map(({ playerId, newValue }) =>
      prisma.playerValueHistory.create({ data: { playerId, value: newValue, gameweekId } })
    ),
  ]);

  return { updatedCount: updates.length, playersConsidered: inputs.length };
}
