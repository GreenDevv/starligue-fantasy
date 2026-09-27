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
  /** true = classement lnh.fr déjà en avance sur la journée visée, rien écrit. */
  skippedAhead?: boolean;
}

// Le classement lnh.fr est mis à jour dès la fin d'un match, parfois avant que notre
// Match.status passe à FINISHED : la « dernière journée finie » vue par l'appelant
// peut alors être N alors que lnh.fr compte déjà un match de N+1. Écrire ce
// classement dans l'instantané N le corromprait (cas réel : SRVH–SARAN J4 compté
// dans l'instantané J3, 25/09). Invariant : dans l'instantané de la journée N, aucun
// club n'a joué plus de N matchs (moins est possible : match reporté).
export function standingsFitGameweek(rows: { played: number }[], gameweekNumber: number): boolean {
  return rows.every((r) => r.played <= gameweekNumber);
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

  if (!standingsFitGameweek(rows, gameweekNumber)) {
    console.warn(`[standings] classement lnh.fr en avance sur J${gameweekNumber} (un club a joué plus de ${gameweekNumber} matchs) — instantané non écrit`);
    return { gameweekNumber, upserted: 0, unresolvedSlugs, skippedAhead: true };
  }

  const upserted = await snapshotClubStandings(seasonId, gameweekNumber, rows, "LNH_SCRAPER");

  return { gameweekNumber, upserted, unresolvedSlugs };
}
