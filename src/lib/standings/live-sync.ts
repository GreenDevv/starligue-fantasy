// Sync du classement officiel LNH (saison live 2026/27) — copie chaque ligne du
// classement daikin-starligue/classement telle quelle (rang + record + buts font
// autorité LNH, pas recalculés côté app), snapshotée à la journée en cours.
import { prisma } from "@/lib/db";
import { createLnhScraperProvider } from "@/lib/data-providers/lnh-scraper.provider";
import { snapshotClubStandings } from "./snapshot";
import type { ComputedClubStanding } from "./compute";

export interface LiveStandingsSyncResult {
  gameweekNumber: number;
  upserted: number;
  unresolvedSlugs: string[];
}

export async function syncLiveClubStandings(
  seasonId: string,
  lnhSeasonsId: string,
  gameweekNumber: number
): Promise<LiveStandingsSyncResult> {
  const provider = createLnhScraperProvider();
  const scraped = await provider.fetchStandings(lnhSeasonsId);

  const dbClubs = await prisma.club.findMany();
  const clubIdBySlug = new Map<string, string>();
  for (const c of dbClubs) {
    const extIds = (c.externalIds as Record<string, string>) ?? {};
    if (extIds.lnh) clubIdBySlug.set(extIds.lnh.toLowerCase(), c.id);
  }

  const rows: ComputedClubStanding[] = [];
  const unresolvedSlugs: string[] = [];
  for (const s of scraped) {
    const clubId = clubIdBySlug.get(s.clubSlug.toLowerCase());
    if (!clubId) {
      unresolvedSlugs.push(s.clubSlug);
      continue;
    }
    rows.push({
      clubId,
      rank: s.rank,
      points: s.points,
      played: s.played,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      goalsFor: s.goalsFor,
      goalsAgainst: s.goalsAgainst,
      goalAvg: s.goalAvg,
    });
  }

  const upserted = await snapshotClubStandings(seasonId, gameweekNumber, rows, "LNH_SCRAPER");

  return { gameweekNumber, upserted, unresolvedSlugs };
}
