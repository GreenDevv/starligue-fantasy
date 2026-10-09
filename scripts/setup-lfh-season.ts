/**
 * Mise en place du jeu Ligue Butagaz Énergie sur SA base — ARCHITECTURE.md §35.4.
 *
 *   NEXT_PUBLIC_COMPETITION=LFH DATABASE_URL=<base LFH> pnpm tsx scripts/setup-lfh-season.ts [étapes]
 *
 * Étapes (toutes par défaut, dans cet ordre, chacune rejouable) :
 *   config    GameConfig : défauts communs + surcharges LFH (ne remplace jamais une clé existante)
 *   season    saison, 12 clubs, 22 journées, matchs, joueuses (API LFH)
 *   stats     stats + note calculée de chaque journée déjà jouée, classement, puis
 *             journées d'avant-lancement (sans aucune équipe) marquées closes
 *   valuation valeurs de départ depuis les notes de début de saison
 *
 * Garde-fou : refuse de tourner sur une base qui contient des clubs Starligue
 * (externalIds.lnh) — la base du jeu masculin ne doit jamais recevoir de données LFH.
 */
import { prisma } from "../src/lib/db";
import { getCompetitionId } from "../src/lib/competition/profile";
import {
  setupLfhSeason,
  valueLfhPlayersFromSeasonStats,
} from "../src/lib/ingestion/lfh";
import { refreshLfhSeasonStats } from "../src/lib/ingestion/lfh-launch";
import { GAME_CONFIG } from "../prisma/game-config-defaults";

const SEASON_LABEL = "2026-2027";

// Surcharges du jeu LFH (décisions du 29/09/2026).
const LFH_GAME_CONFIG: Record<string, string> = {
  // « Amplitude moins importante que chez les hommes » (4 → 20, soit 16 points) :
  // 10 points. Fourchette placée pour que le budget soit le MÊME que chez les
  // hommes (décision du 29/09) avec la même tension : valeur moyenne ≈ 10,6
  // (hommes : 140 / 14 joueurs / 10,57 de moyenne).
  VALUATION_MIN_VALUE: "7.5",
  VALUATION_MAX_VALUE: "17.5",
  // ~12 joueuses notées par poste et par journée (contre ~16 hommes) : bouger
  // 5 hautes + 5 basses ferait varier presque tout le monde chaque semaine.
  VALUE_ADJUSTMENT_TOP_N: "3",
  VALUE_ADJUSTMENT_BOTTOM_N: "3",
  // Même budget que la Starligue (décision du 29/09) — ce sont les valeurs qui
  // s'adaptent (fourchette ci-dessus), pas le budget.
  INITIAL_BUDGET: "140.0",
};

const STEPS = ["config", "season", "stats", "valuation"] as const;
type Step = (typeof STEPS)[number];

async function assertLfhDatabase() {
  if (getCompetitionId() !== "LFH") {
    throw new Error("NEXT_PUBLIC_COMPETITION=LFH requis (ce script ne sert que le jeu Ligue Butagaz).");
  }
  const clubs = await prisma.club.findMany({ select: { externalIds: true } });
  const starligue = clubs.filter((c) => (c.externalIds as Record<string, unknown>)?.lnh);
  if (starligue.length > 0) {
    throw new Error(`Base refusée : ${starligue.length} clubs Starligue présents. Pointer DATABASE_URL sur la base LFH.`);
  }
}

async function stepConfig() {
  const entries = Object.entries({ ...GAME_CONFIG, ...LFH_GAME_CONFIG });
  const { count } = await prisma.gameConfig.createMany({
    data: entries.map(([key, value]) => ({ key, value })),
    skipDuplicates: true,
  });
  console.log(`config     ${count} clés créées (${entries.length - count} déjà présentes, inchangées)`);
}

async function stepSeason() {
  const r = await setupLfhSeason(SEASON_LABEL);
  console.log(
    `season     ${r.clubs} clubs, ${r.gameweeks} journées, ${r.matches} matchs (${r.matchesWithoutDate} sans date), ${r.players} joueuses`
  );
  if (r.playersSkippedNoPosition.length > 0) {
    console.log(`           ignorées faute de poste : ${r.playersSkippedNoPosition.join(", ")}`);
  }
}

async function stepStats() {
  const season = await prisma.season.findUniqueOrThrow({ where: { label: SEASON_LABEL } });
  const r = await refreshLfhSeasonStats(season.id);
  for (const gw of r.gameweeks) {
    console.log(
      `stats      J${gw.number} : ${gw.matchesProcessed} matchs, ${gw.statsUpserted} lignes` +
        (gw.missingSheets.length ? `, feuilles vision-sport manquantes : ${gw.missingSheets.join(", ")}` : "") +
        (gw.unresolved.length ? `, joueuses introuvables : ${gw.unresolved.join(", ")}` : "")
    );
  }
  if (r.standings) {
    const s = r.standings;
    console.log(`classement J${s.gameweek} : ${s.upserted} clubs${s.skippedAhead ? " (en avance, non écrit)" : ""}`);
  }
  console.log(`closes     ${r.closed.length ? r.closed.map((n) => `J${n}`).join(", ") : "aucune"} (jouées avant le lancement, sans équipe)`);
}

async function stepValuation() {
  const season = await prisma.season.findUniqueOrThrow({ where: { label: SEASON_LABEL } });
  const r = await valueLfhPlayersFromSeasonStats(season.id);
  console.log(
    `valuation  ${r.valued} joueuses (${r.withoutMatch} sans match → plancher), moyenne ${r.averageValue} — ` +
      `budget à même tension que les hommes : ${r.suggestedBudget} (jeu : 140)`
  );
}

async function main() {
  const requested = process.argv.slice(2);
  const unknown = requested.filter((s) => !STEPS.includes(s as Step));
  if (unknown.length) throw new Error(`Étape(s) inconnue(s) : ${unknown.join(", ")} — attendu : ${STEPS.join(", ")}`);
  const steps = requested.length ? STEPS.filter((s) => requested.includes(s)) : STEPS;

  await assertLfhDatabase();
  for (const step of steps) {
    if (step === "config") await stepConfig();
    if (step === "season") await stepSeason();
    if (step === "stats") await stepStats();
    if (step === "valuation") await stepValuation();
  }
}

main()
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
