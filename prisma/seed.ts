/**
 * Seed — Starligue Fantasy (ARCHITECTURE.md §5, §12 Phase 1.1)
 *
 * Contenu : saison 2026-2027 active, 16 clubs, 14 joueurs placeholder par club
 * (2 par poste × 7 postes), 30 journées et le calendrier réel (240 matchs)
 * de la Daikin StarLigue 2026/27, ainsi que les constantes de jeu (GameConfig).
 *
 * Clubs et calendrier chargés depuis clubs_starligue_2026.csv et
 * fixtures_starligue_2026.csv (données réelles lnh.fr, ARCHITECTURE.md §7)
 * via CsvProvider — seuls les joueurs restent placeholder (mercato non figé).
 *
 * Idempotent : ré-exécutable sans doublon (upsert par clés naturelles, find-first
 * pour les modèles sans contrainte unique). Voir CLAUDE.md : « jamais de create nu ».
 */
import { PrismaClient, Position } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";
import { CsvProvider } from "../src/lib/data-providers/csv.provider";

const prisma = new PrismaClient();

const SEASON_LABEL = "2026-2027";
const GAMEWEEK_COUNT = 30;

// Les 7 postes dans l'ordre de terrain (ARCHITECTURE.md §2.1)
const POSITIONS: Position[] = ["GK", "LW", "LB", "CB", "RB", "RW", "PV"];

const POSITION_LABEL: Record<Position, string> = {
  GK: "Gardien",
  LW: "Ailier G.",
  LB: "Arrière G.",
  CB: "Demi-Centre",
  RB: "Arrière D.",
  RW: "Ailier D.",
  PV: "Pivot",
};

// Valeur marchande de base par poste (unité arbitraire, §2.2 : plage 3.0–15.0)
const BASE_VALUE: Record<Position, number> = {
  GK: 9.0,
  LW: 7.0,
  LB: 9.5,
  CB: 9.5,
  RB: 9.5,
  RW: 7.0,
  PV: 8.0,
};

// Métadonnées de seed non fournies par clubs_starligue_2026.csv (qui ne contient
// que les données publiques LNH : nom, shortName, logo) :
//   - tier : ajustement de la valeur marchande des joueurs placeholder (top +2, mid 0, bas -1.5)
//   - lnh  : slug externalIds.lnh, dérivé du nom de fichier logo LNH (sports_teams/<slug>__logo__...)
//            utilisé par sync-players-lnh / import lnh-roster pour matcher les clubs
const CLUB_META: Record<string, { tier: number; lnh: string }> = {
  PSG: { tier: 2, lnh: "paris" },
  MHB: { tier: 2, lnh: "montpellier" },
  HBCN: { tier: 2, lnh: "nantes" },
  PAUC: { tier: 2, lnh: "aix" },
  CSMBH: { tier: 0, lnh: "chambery" },
  USAM: { tier: 0, lnh: "nimes" },
  USDK: { tier: 0, lnh: "dunkerque" },
  FENIX: { tier: 0, lnh: "toulouse" },
  SARAN: { tier: 0, lnh: "saran" },
  LIMOGES: { tier: 0, lnh: "limoges" },
  CRMHB: { tier: -1.5, lnh: "cesson-rennes" },
  SAHB: { tier: -1.5, lnh: "selestat" },
  CCMHB: { tier: -1.5, lnh: "chartres" },
  CAEN: { tier: -1.5, lnh: "caen" },
  SRVH: { tier: -1.5, lnh: "saint-raphael" },
  TREMBLAY: { tier: -1.5, lnh: "tremblay" },
};

// Constantes de jeu — ARCHITECTURE.md §2.1, §2.2, §2.3
const GAME_CONFIG: Record<string, string> = {
  INITIAL_BUDGET: process.env.INITIAL_BUDGET ?? "100.0",
  SQUAD_SIZE: "14",
  PLAYERS_PER_POSITION: "2",
  STARTERS_PER_POSITION: "1",
  MAX_PLAYERS_PER_CLUB: "3",
  RATING_BASELINE: "5", // note neutre
  RATING_MULTIPLIER: "4", // pointsBruts = (note - 5) × 4
  STARTER_MULTIPLIER: "1.0",
  BENCH_MULTIPLIER: "0.5",
  WIN_BONUS_ENABLED: "false",
  WIN_BONUS_POINTS: "2",
  // Bonus/malus "leader de journée" sur les stats détaillées de boxscore (src/lib/scoring/stat-leaders.ts)
  STAT_LEADER_BONUS_ENABLED: "true",
  STAT_LEADER_BONUS_POINTS: "2",
  STAT_LEADER_MALUS_POINTS: "2",
  // API-Sports — à confirmer via GET https://v1.handball.api-sports.io/leagues
  API_SPORTS_LEAGUE_ID: process.env.API_SPORTS_LEAGUE_ID ?? "27",
  // Capitaine, valeur dynamique, joker médical — voir ARCHITECTURE.md "v2"
  CAPTAIN_MULTIPLIER: "2.0",
  // Bonus de saison (src/lib/scoring/engine.ts::applySeasonBonus) — 4 types, 1×/saison
  // chacun, quota global de 3 activations/saison (src/app/api/my-team/bonus/route.ts)
  TRIPLE_CAPTAIN_MULTIPLIER: "3.0",
  BENCH_BOOST_MULTIPLIER: "1.0",
  STAT_BONUS_MULTIPLIER: "1.0",
  STATISTICIAN_MULTIPLIER: "2.0",
  SEASON_BONUS_QUOTA_PER_SEASON: "3",
  VALUE_ADJUSTMENT_STEP: "0.5",
  VALUE_ADJUSTMENT_TOP_N: "5",
  VALUE_ADJUSTMENT_BOTTOM_N: "5",
  VALUE_ADJUSTMENT_MIN: "1.0",
  JOKER_QUOTA_PER_SEASON: "2",
  // Points → budget et trades entre managers — voir src/lib/budget/points-conversion.ts, src/lib/trades/proposal.ts
  POINTS_TO_BUDGET_RATE: "0.1",
  TRADE_PROPOSAL_EXPIRY_HOURS: "72",
  // Pronostics de journée — src/lib/predictions/*, ARCHITECTURE.md §14
  PREDICTION_MULTIPLIER_MIN: "0",
  PREDICTION_MULTIPLIER_MAX: "2.0",
  PREDICTION_LOCK_MINUTES_BEFORE_KICKOFF: "5",
  PREDICTION_BOOKMAKER_MARGIN: "0.08",
  PREDICTION_STRENGTH_SCALE: "4.0",
  PREDICTION_MAX_SKEW: "0.3",
  PREDICTION_BASE_PROB_HOME: "0.45",
  PREDICTION_BASE_PROB_DRAW: "0.10",
  PREDICTION_BASE_PROB_AWAY: "0.45",
};

const HOUR = 60 * 60 * 1000;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function marketValue(position: Position, tier: number, slot: number): number {
  // slot 0 = titulaire indicatif, slot 1 = doublure (moins chère)
  const raw = BASE_VALUE[position] + tier - (slot === 1 ? 2 : 0);
  return round1(Math.min(15, Math.max(3, raw)));
}

async function main() {
  console.log(`🌱 Seed Starligue Fantasy — saison ${SEASON_LABEL}`);

  // 1. Saison (unique par label) — devient la seule saison active
  await prisma.season.updateMany({ data: { isActive: false } });
  const season = await prisma.season.upsert({
    where: { label: SEASON_LABEL },
    update: { isActive: true },
    create: { label: SEASON_LABEL, isActive: true },
  });

  // 2. GameConfig (upsert par key)
  for (const [key, value] of Object.entries(GAME_CONFIG)) {
    await prisma.gameConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
  console.log(`   ✓ ${Object.keys(GAME_CONFIG).length} clés GameConfig`);

  // 3. Clubs — chargés depuis le calendrier réel LNH 2026/27 (CSV, §7).
  //    Club n'a pas de contrainte unique (§5) → find-first puis upsert manuel.
  const clubsCsvText = readFileSync(join(__dirname, "clubs_starligue_2026.csv"), "utf-8");
  const clubsParsed = CsvProvider.parseClubs(clubsCsvText);
  if (!clubsParsed.ok) {
    throw new Error(`clubs_starligue_2026.csv invalide : ${JSON.stringify(clubsParsed.errors)}`);
  }

  const clubIdByShort = new Map<string, string>();
  for (const row of clubsParsed.rows) {
    const meta = CLUB_META[row.shortName];
    if (!meta) throw new Error(`Club ${row.shortName} absent de CLUB_META (tier/slug LNH)`);

    const existing = await prisma.club.findFirst({ where: { shortName: row.shortName } });
    const data = {
      name: row.name,
      shortName: row.shortName,
      logoUrl: row.logoUrl || null,
      externalIds: { lnh: meta.lnh },
    };
    const club = existing
      ? await prisma.club.update({ where: { id: existing.id }, data })
      : await prisma.club.create({ data });
    clubIdByShort.set(row.shortName, club.id);
  }
  console.log(`   ✓ ${clubsParsed.rows.length} clubs (Daikin StarLigue 2026/27, lnh.fr)`);

  // 4. Joueurs placeholder — 2 par poste × 7 postes = 14 / club
  let playerCount = 0;
  for (const row of clubsParsed.rows) {
    const clubId = clubIdByShort.get(row.shortName)!;
    const tier = CLUB_META[row.shortName]!.tier;
    for (const position of POSITIONS) {
      for (let slot = 0; slot < 2; slot++) {
        const firstName = POSITION_LABEL[position];
        const lastName = `${row.shortName} ${slot + 1}`;
        const value = marketValue(position, tier, slot);
        await prisma.player.upsert({
          where: {
            seasonId_clubId_firstName_lastName: {
              seasonId: season.id,
              clubId,
              firstName,
              lastName,
            },
          },
          update: { position, marketValue: value },
          create: {
            seasonId: season.id,
            clubId,
            firstName,
            lastName,
            position,
            marketValue: value,
            externalIds: { placeholder: true },
          },
        });
        playerCount++;
      }
    }
  }
  console.log(`   ✓ ${playerCount} joueurs placeholder`);

  // 5. Journées + calendrier — chargés depuis le calendrier réel LNH 2026/27 (CSV, §7).
  //    Journées upsert par [seasonId, number] ; deadline = kickoff le plus tôt de la
  //    journée − 1h (§2.4).
  const fixturesCsvText = readFileSync(join(__dirname, "fixtures_starligue_2026.csv"), "utf-8");
  const fixturesParsed = CsvProvider.parseFixtures(fixturesCsvText);
  if (!fixturesParsed.ok) {
    throw new Error(`fixtures_starligue_2026.csv invalide : ${JSON.stringify(fixturesParsed.errors)}`);
  }

  const rowsByGameweek = new Map<number, typeof fixturesParsed.rows>();
  for (const row of fixturesParsed.rows) {
    const list = rowsByGameweek.get(row.gameweek) ?? [];
    list.push(row);
    rowsByGameweek.set(row.gameweek, list);
  }

  let matchCount = 0;
  for (let n = 1; n <= GAMEWEEK_COUNT; n++) {
    const rows = rowsByGameweek.get(n);
    if (!rows || rows.length === 0) throw new Error(`Journée ${n} absente de fixtures_starligue_2026.csv`);

    const kickoffs = rows.map((r) => new Date(r.date.replace(" ", "T") + ":00"));
    const deadlineAt = new Date(Math.min(...kickoffs.map((d) => d.getTime())) - HOUR);

    const gw = await prisma.gameweek.upsert({
      where: { seasonId_number: { seasonId: season.id, number: n } },
      update: { deadlineAt },
      create: { seasonId: season.id, number: n, deadlineAt },
    });

    for (const row of rows) {
      const homeClubId = clubIdByShort.get(row.homeShortName);
      const awayClubId = clubIdByShort.get(row.awayShortName);
      if (!homeClubId) throw new Error(`Club domicile inconnu dans le calendrier : ${row.homeShortName}`);
      if (!awayClubId) throw new Error(`Club extérieur inconnu dans le calendrier : ${row.awayShortName}`);

      const kickoffAt = new Date(row.date.replace(" ", "T") + ":00");
      const existing = await prisma.match.findFirst({
        where: { gameweekId: gw.id, homeClubId, awayClubId },
      });
      const data = {
        seasonId: season.id,
        gameweekId: gw.id,
        homeClubId,
        awayClubId,
        kickoffAt,
        externalIds: { source: "lnh_calendrier_2026" },
      };
      if (existing) {
        await prisma.match.update({ where: { id: existing.id }, data: { kickoffAt } });
      } else {
        await prisma.match.create({ data });
      }
      matchCount++;
    }
  }
  console.log(`   ✓ ${GAMEWEEK_COUNT} journées, ${matchCount} matchs (calendrier réel Daikin StarLigue 2026/27, lnh.fr)`);

  console.log("✅ Seed terminé.");
}

main()
  .catch((e) => {
    console.error("❌ Seed échoué :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
