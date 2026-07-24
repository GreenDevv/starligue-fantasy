// Script ponctuel : re-scrape les boxscores des journées déjà avancées en Mode
// Simulation (avant l'ajout des stats détaillées, cf. plan "Stats détaillées par
// match") pour peupler les nouveaux champs PlayerMatchStat, puis recalcule les
// points de tous les SimulationLineup de ces journées pour qu'ils reflètent enfin
// le bonus/malus "leader de journée" (src/lib/scoring/stat-leaders.ts).
// Rejouable : idempotent (upsert), pas de route admin dédiée — usage ponctuel comme
// scripts/run-lnh-scores-import.ts.
import { PrismaClient } from "@prisma/client";
import {
  createLnhScraperProvider,
  boxscoreRowToStatFields,
  type ScrapedMatchBoxscoreRow,
} from "../src/lib/data-providers/lnh-scraper.provider";
import { computeSimulationGameweekScores } from "../src/lib/scoring/compute.simulation";
import { SIMULATION_SEASON_LABEL } from "../src/lib/simulation/constants";

const LNH_SEASONS_ID = process.argv[2] ?? "39"; // 2025/2026

const prisma = new PrismaClient();

async function main() {
  const season = await prisma.season.findUnique({ where: { label: SIMULATION_SEASON_LABEL } });
  if (!season) throw new Error(`Saison ${SIMULATION_SEASON_LABEL} introuvable`);

  // Journées déjà couvertes par au moins un PlayerMatchStat (= déjà avancées par au
  // moins une équipe de simulation)
  const gameweeks = await prisma.gameweek.findMany({
    where: { seasonId: season.id, matches: { some: { playerStats: { some: {} } } } },
    orderBy: { number: "asc" },
    include: { matches: true, simulationLineups: { select: { id: true } } },
  });
  console.log(`${gameweeks.length} journée(s) déjà avancée(s) à re-synchroniser`);

  const provider = createLnhScraperProvider();
  const dbClubs = await prisma.club.findMany();
  const clubShortNameBySlug = new Map<string, string>();
  for (const c of dbClubs) {
    const extIds = (c.externalIds as Record<string, string>) ?? {};
    if (extIds.lnh) clubShortNameBySlug.set(extIds.lnh.toLowerCase(), c.shortName);
  }
  const seasonPlayers = await prisma.player.findMany({
    where: { seasonId: season.id },
    include: { club: { select: { shortName: true } } },
  });
  const playerByKey = new Map<string, (typeof seasonPlayers)[number]>();
  for (const p of seasonPlayers) {
    const key = `${p.lastName.toLowerCase()}|${p.firstName.toLowerCase()}|${p.club.shortName.toLowerCase()}`;
    playerByKey.set(key, p);
  }

  let totalStatsUpserted = 0;
  let totalLineupsRecomputed = 0;

  for (const gw of gameweeks) {
    const matchesWithCalendarsId = gw.matches
      .map((m) => ({ match: m, calendarsId: (m.externalIds as Record<string, string>)?.lnh_calendars_id }))
      .filter((x): x is { match: (typeof gw.matches)[number]; calendarsId: string } => Boolean(x.calendarsId));

    if (matchesWithCalendarsId.length === 0) {
      console.log(`J${gw.number} : aucun match avec calendars_id, ignorée`);
      continue;
    }

    const boxscoresByCalendarsId = await provider.fetchGameweekMatchStats(
      matchesWithCalendarsId.map((x) => x.calendarsId),
      LNH_SEASONS_ID
    );

    const statUpserts: Array<{ matchId: string; playerId: string } & ScrapedMatchBoxscoreRow> = [];
    for (const { match, calendarsId } of matchesWithCalendarsId) {
      const rows = boxscoresByCalendarsId.get(calendarsId) ?? [];
      for (const row of rows) {
        const clubShortName = clubShortNameBySlug.get(row.lnhClubSlug.toLowerCase());
        if (!clubShortName) continue;
        const key = `${row.lastName.toLowerCase()}|${row.firstName.toLowerCase()}|${clubShortName.toLowerCase()}`;
        const player = playerByKey.get(key);
        if (!player) continue;
        statUpserts.push({ matchId: match.id, playerId: player.id, ...row });
      }
    }

    if (statUpserts.length > 0) {
      await prisma.$transaction(
        statUpserts.map((u) => {
          const fields = boxscoreRowToStatFields(u);
          return prisma.playerMatchStat.upsert({
            where: { matchId_playerId: { matchId: u.matchId, playerId: u.playerId } },
            create: { matchId: u.matchId, playerId: u.playerId, ...fields },
            update: fields,
          });
        })
      );
    }
    totalStatsUpserted += statUpserts.length;

    for (const lineup of gw.simulationLineups) {
      await computeSimulationGameweekScores(lineup.id);
      totalLineupsRecomputed++;
    }

    console.log(
      `J${gw.number} : ${statUpserts.length} stats upserted, ${gw.simulationLineups.length} lineup(s) recalculé(s)`
    );
  }

  console.log(JSON.stringify({ totalStatsUpserted, totalLineupsRecomputed }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
