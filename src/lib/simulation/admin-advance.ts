// Avancée admin globale de la saison simulée — remplace l'ancien
// POST /api/simulation/advance (par équipe, retiré à la fusion live/simulation) :
// une seule journée avancée pour TOUTES les SimulationTeam validées à la fois,
// le curseur Season.currentSimulationGameweekNumber devenant la source de vérité
// (voir plan de fusion live/simulation, étape 6).
import { prisma } from "@/lib/db";
import { SIMULATION_SEASON_LABEL, SIMULATION_LNH_SEASONS_ID } from "./constants";
import { planNextGameweek, planPreviousGameweek } from "./advance-plan";
import { syncGameweekBoxscore } from "@/lib/ingestion/boxscore";
import { computeSimulationGameweekScores, recalcSimulationTeamTotalPoints } from "@/lib/scoring/compute.simulation";
import { applyCumulativeSimulationValuation } from "@/lib/players/simulation-valuation";
import { computeAndSnapshotSimulationStandings } from "@/lib/standings/simulation-sync";

export type AdminAdvanceResult =
  | {
      status: "advanced";
      gameweekNumber: number;
      teamsScored: number;
      matchesProcessed: number;
      statsUpserted: number;
      valuationUpdated: number;
    }
  | { status: "season_complete" }
  | { status: "conflict" }; // une autre requête a déjà avancé entretemps — retry sûr (tout est idempotent)

export type AdminRevertResult =
  | { status: "reverted"; gameweekNumber: number; teamsRecomputed: number; valuationUpdated: number }
  | { status: "already_at_start" }
  | { status: "conflict" };

export async function advanceSimulationSeasonGameweek(): Promise<AdminAdvanceResult> {
  const season = await prisma.season.findUniqueOrThrow({ where: { label: SIMULATION_SEASON_LABEL } });
  const totalGameweeks = await prisma.gameweek.count({ where: { seasonId: season.id } });

  const nextNumber = planNextGameweek(season.currentSimulationGameweekNumber, totalGameweeks);
  if (nextNumber === null) {
    return { status: "season_complete" };
  }

  const gameweek = await prisma.gameweek.findUniqueOrThrow({
    where: { seasonId_number: { seasonId: season.id, number: nextNumber } },
  });

  // Scrape hors transaction (réseau) — une fois pour toute la saison, tous clubs
  // confondus (amélioration vs l'ancien flux par équipe qui re-scrapait à chaque avancée).
  const boxscoreResult = await syncGameweekBoxscore(gameweek.id, SIMULATION_LNH_SEASONS_ID);

  const teams = await prisma.simulationTeam.findMany({
    where: { seasonId: season.id, isValidated: true },
    include: { squad: { include: { player: { select: { position: true } } } } },
  });

  let teamsScored = 0;
  for (const team of teams) {
    const existing = await prisma.simulationLineup.findUnique({
      where: { simulationTeamId_gameweekId: { simulationTeamId: team.id, gameweekId: gameweek.id } },
      select: { id: true },
    });

    const lineupId = existing
      ? existing.id
      : (
          await prisma.$transaction(async (tx) => {
            // Consomme le bonus en attente (s'il y en a un) : snapshoté sur le
            // lineup et marqué comme utilisé pour la saison (SimulationBonusUsage,
            // 1×/saison/type), voir FantasyBonusUsage (jeu en direct) pour l'équivalent.
            const bonus = team.pendingBonus;
            const created = await tx.simulationLineup.create({
              data: {
                simulationTeamId: team.id,
                gameweekId: gameweek.id,
                entries: team.squad.map((s) => ({
                  playerId: s.playerId,
                  position: s.player.position,
                  role: s.role,
                  purchasePrice: Number(s.purchasePrice),
                  isCaptain: s.playerId === team.captainId && s.role === "STARTER",
                })),
                bonus,
              },
              select: { id: true },
            });
            if (bonus !== null) {
              await tx.simulationBonusUsage.create({
                data: { simulationTeamId: team.id, gameweekId: gameweek.id, type: bonus },
              });
              await tx.simulationTeam.update({ where: { id: team.id }, data: { pendingBonus: null } });
            }
            return created;
          })
        ).id;

    await computeSimulationGameweekScores(lineupId, { skipValueAdjustment: true });
    teamsScored++;
  }

  const { updatedCount: valuationUpdated } = await applyCumulativeSimulationValuation(season.id, nextNumber);
  await computeAndSnapshotSimulationStandings(season.id, nextNumber);

  // Bump atomique protégé contre un double-clic/appel concurrent : si le compteur a
  // déjà bougé entretemps (count === 0), tout le travail ci-dessus reste sans effet
  // de bord néfaste (upserts par clé, valorisation idempotente pour ce uptoGameweekNumber).
  const bump = await prisma.season.updateMany({
    where: { id: season.id, currentSimulationGameweekNumber: nextNumber - 1 },
    data: { currentSimulationGameweekNumber: nextNumber },
  });
  if (bump.count === 0) {
    return { status: "conflict" };
  }

  await prisma.gameweek.update({ where: { id: gameweek.id }, data: { isScored: true } });

  return {
    status: "advanced",
    gameweekNumber: nextNumber,
    teamsScored,
    matchesProcessed: boxscoreResult.matchesProcessed,
    statsUpserted: boxscoreResult.statsUpserted,
    valuationUpdated,
  };
}

// Symétrique de advanceSimulationSeasonGameweek : annule la dernière journée
// avancée pour TOUTES les SimulationTeam à la fois. Supprime aussi les
// PlayerMatchStat de cette journée (re-scrapés si on ré-avance plus tard) — sinon
// des routes comme /api/stats/leaders ou computeBestXI, qui lisent PlayerMatchStat
// par seasonId sans notion de curseur (invariant hérité du jeu en direct : "des
// stats existent" ⟺ "la journée a été jouée"), continueraient à afficher les
// stats d'une journée annulée alors que Season.currentSimulationGameweekNumber dit
// qu'elle n'a pas encore eu lieu. Bug réel observé : joueurs valorisés/statistiques
// visibles alors que le curseur affichait "Journée 0".
export async function revertSimulationSeasonGameweek(): Promise<AdminRevertResult> {
  const season = await prisma.season.findUniqueOrThrow({ where: { label: SIMULATION_SEASON_LABEL } });

  const gameweekNumber = planPreviousGameweek(season.currentSimulationGameweekNumber);
  if (gameweekNumber === null) {
    return { status: "already_at_start" };
  }

  const gameweek = await prisma.gameweek.findUniqueOrThrow({
    where: { seasonId_number: { seasonId: season.id, number: gameweekNumber } },
  });

  // Même ordre que advanceSimulationSeasonGameweek : tout le travail idempotent
  // d'abord, le bump atomique du curseur en dernier — un crash en cours de route
  // laisse le curseur cohérent avec le travail réellement effectué (rejouable sans
  // risque, jamais de curseur décrémenté avant que le reste ne soit fait).
  const lineupsToRemove = await prisma.simulationLineup.findMany({
    where: { gameweekId: gameweek.id },
    select: { simulationTeamId: true },
  });
  await prisma.simulationLineup.deleteMany({ where: { gameweekId: gameweek.id } });
  // Symétrique de la consommation dans advanceSimulationSeasonGameweek : la journée
  // annulée n'a plus "eu lieu", donc le bonus qui y était consommé (s'il y en a un)
  // redevient disponible — on ne réarme pas team.pendingBonus automatiquement
  // (il a pu être changé depuis), l'utilisateur le resélectionne via PUT /api/my-team/bonus.
  await prisma.simulationBonusUsage.deleteMany({ where: { gameweekId: gameweek.id } });
  await prisma.playerMatchStat.deleteMany({ where: { match: { gameweekId: gameweek.id } } });
  // Même précaution que ci-dessus pour l'historique de valeur : la journée qu'on
  // annule (et toute journée AU-DELÀ, si un ré-avancement précédent était allé plus
  // loin avant qu'on ne revienne ici en plusieurs crans) ne doit laisser aucune
  // ligne PlayerValueHistory derrière elle — sinon elle reste en base "révélée aux
  // yeux de la requête" alors que le curseur dit le contraire.
  await prisma.playerValueHistory.deleteMany({
    where: { gameweek: { seasonId: season.id, number: { gte: gameweekNumber } } },
  });

  let teamsRecomputed = 0;
  for (const { simulationTeamId } of lineupsToRemove) {
    await recalcSimulationTeamTotalPoints(simulationTeamId);
    teamsRecomputed++;
  }

  const { updatedCount: valuationUpdated } = await applyCumulativeSimulationValuation(season.id, gameweekNumber - 1);
  // Le snapshot de la journée annulée n'est plus valide — celui de gameweekNumber-1
  // (s'il existe) reste inchangé, pas besoin de le recalculer.
  await prisma.clubStanding.deleteMany({ where: { seasonId: season.id, gameweekNumber } });

  const bump = await prisma.season.updateMany({
    where: { id: season.id, currentSimulationGameweekNumber: gameweekNumber },
    data: { currentSimulationGameweekNumber: gameweekNumber - 1 },
  });
  if (bump.count === 0) {
    return { status: "conflict" };
  }

  await prisma.gameweek.update({ where: { id: gameweek.id }, data: { isScored: false } });

  return { status: "reverted", gameweekNumber, teamsRecomputed, valuationUpdated };
}
