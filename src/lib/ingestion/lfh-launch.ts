// Rafraîchissement d'avant-lancement du jeu LBE — ARCHITECTURE.md §35.4.1.
//
// Étapes « stats » et « valuation » de scripts/setup-lfh-season.ts, partagées avec
// la route POST /api/cron/lfh-launch-prep (appelée le jour J par
// .github/workflows/lbe-launch.yml : la base LBE n'a pas d'accès réseau public, un
// runner GitHub ne peut pas lancer le script lui-même).

import { prisma } from "@/lib/db";
import {
  syncLfhSeasonCalendar,
  syncLfhGameweekStats,
  syncLfhStandings,
  valueLfhPlayersFromSeasonStats,
  closePreLaunchGameweeks,
  type LfhValuationResult,
} from "./lfh";

export type LfhStatsRefreshResult = {
  gameweeks: {
    number: number;
    matchesProcessed: number;
    statsUpserted: number;
    missingSheets: string[];
    unresolved: string[];
  }[];
  standings: { gameweek: number; upserted: number; skippedAhead: boolean } | null;
  closed: number[];
};

/** Stats + note de chaque journée jouée, classement, journées d'avant-lancement closes. */
export async function refreshLfhSeasonStats(seasonId: string): Promise<LfhStatsRefreshResult> {
  const gameweeks = await prisma.gameweek.findMany({
    where: { seasonId, matches: { some: { status: "FINISHED" } } },
    orderBy: { number: "asc" },
  });
  const report: LfhStatsRefreshResult = { gameweeks: [], standings: null, closed: [] };
  for (const gw of gameweeks) {
    const r = await syncLfhGameweekStats(gw.id);
    report.gameweeks.push({
      number: r.gameweekNumber,
      matchesProcessed: r.matchesProcessed,
      statsUpserted: r.statsUpserted,
      missingSheets: r.missingSheets,
      unresolved: r.unresolved,
    });
  }
  const last = gameweeks.at(-1);
  if (last) {
    const s = await syncLfhStandings(seasonId, last.number);
    report.standings = { gameweek: last.number, upserted: s.upserted, skippedAhead: Boolean(s.skippedAhead) };
  }
  report.closed = await closePreLaunchGameweeks(seasonId);
  return report;
}

export class LfhLaunchPrepRefused extends Error {}

/**
 * Jour J : calendrier → stats → valorisation. Refuse dès qu'une équipe existe : la
 * valorisation réécrit toutes les valeurs, ce qui fausserait le budget d'un
 * effectif déjà composé (et écraserait les ajustements hebdo une fois le jeu lancé).
 */
export async function runLfhLaunchPrep(seasonId: string): Promise<{
  calendar: unknown;
  stats: LfhStatsRefreshResult;
  valuation: LfhValuationResult;
}> {
  const teams = await prisma.fantasyTeam.count();
  if (teams > 0) {
    throw new LfhLaunchPrepRefused(`${teams} équipe(s) déjà créée(s) : valorisation refusée`);
  }
  const calendar = await syncLfhSeasonCalendar(seasonId);
  const stats = await refreshLfhSeasonStats(seasonId);
  const valuation = await valueLfhPlayersFromSeasonStats(seasonId);
  return { calendar, stats, valuation };
}
