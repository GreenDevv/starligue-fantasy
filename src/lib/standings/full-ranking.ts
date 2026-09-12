// Classement complet "tout-en-un" pour /ranking — le classement général (déjà
// complet, getClubStandings ne tronque jamais), enrichi par club avec :
// - forme (5 derniers résultats V/N/D, du plus ancien au plus récent) ;
// - prochain adversaire (prochain match SCHEDULED/LIVE, à domicile ou à
//   l'extérieur).
// Deux requêtes en bloc (pas une par club, 16 clubs) — même esprit que
// live-fantasy-leaderboard.ts.
import { prisma } from "@/lib/db";
import { getClubStandings, type ClubStandingRow, type ClubStandingsResult } from "./get";
import { matchOutcomeForTeam, type MatchOutcome } from "@/lib/matches/match-outcome";

const FORM_LENGTH = 5;

export interface RankingOpponent {
  clubId: string;
  shortName: string;
  logoUrl: string | null;
  kickoffAt: Date;
  isHome: boolean;
}

export interface RankingRow extends ClubStandingRow {
  // Plus ancien en premier, plus récent en dernier (lecture gauche → droite).
  form: MatchOutcome[];
  nextOpponent: RankingOpponent | null;
}

export interface FullRanking extends Omit<ClubStandingsResult, "rows"> {
  rows: RankingRow[];
}

export async function getFullRanking(seasonId: string): Promise<FullRanking> {
  const standings = await getClubStandings(seasonId);
  if (standings.rows.length === 0) {
    return { ...standings, rows: [] };
  }

  const clubIds = new Set(standings.rows.map((r) => r.clubId));

  const [recentMatches, upcomingMatches] = await Promise.all([
    prisma.match.findMany({
      where: {
        seasonId,
        status: "FINISHED",
        OR: [{ homeClubId: { in: [...clubIds] } }, { awayClubId: { in: [...clubIds] } }],
      },
      orderBy: { kickoffAt: "desc" },
      select: { homeClubId: true, awayClubId: true, homeScore: true, awayScore: true, status: true },
    }),
    prisma.match.findMany({
      where: {
        seasonId,
        status: { in: ["SCHEDULED", "LIVE"] },
        OR: [{ homeClubId: { in: [...clubIds] } }, { awayClubId: { in: [...clubIds] } }],
      },
      orderBy: { kickoffAt: "asc" },
      select: {
        homeClubId: true,
        awayClubId: true,
        kickoffAt: true,
        homeClub: { select: { shortName: true, logoUrl: true } },
        awayClub: { select: { shortName: true, logoUrl: true } },
      },
    }),
  ]);

  // recentMatches est trié du plus récent au plus ancien : on remplit chaque
  // club jusqu'à FORM_LENGTH puis on inverse pour lire gauche → droite du plus
  // ancien au plus récent (convention "forme" habituelle).
  const formByClub = new Map<string, MatchOutcome[]>();
  for (const m of recentMatches) {
    for (const clubId of [m.homeClubId, m.awayClubId]) {
      if (!clubIds.has(clubId)) continue;
      const arr = formByClub.get(clubId) ?? [];
      if (arr.length >= FORM_LENGTH) continue;
      const outcome = matchOutcomeForTeam(clubId === m.homeClubId, m.homeScore, m.awayScore, m.status);
      if (outcome) arr.push(outcome);
      formByClub.set(clubId, arr);
    }
  }
  for (const [clubId, arr] of formByClub) formByClub.set(clubId, [...arr].reverse());

  const nextOpponentByClub = new Map<string, RankingOpponent>();
  for (const m of upcomingMatches) {
    for (const clubId of [m.homeClubId, m.awayClubId]) {
      if (!clubIds.has(clubId) || nextOpponentByClub.has(clubId)) continue;
      const isHome = clubId === m.homeClubId;
      const opponent = isHome ? m.awayClub : m.homeClub;
      const opponentId = isHome ? m.awayClubId : m.homeClubId;
      nextOpponentByClub.set(clubId, {
        clubId: opponentId,
        shortName: opponent.shortName,
        logoUrl: opponent.logoUrl,
        kickoffAt: m.kickoffAt,
        isHome,
      });
    }
  }

  const rows: RankingRow[] = standings.rows.map((r) => ({
    ...r,
    form: formByClub.get(r.clubId) ?? [],
    nextOpponent: nextOpponentByClub.get(r.clubId) ?? null,
  }));

  return { gameweekNumber: standings.gameweekNumber, liveMatchesCounted: standings.liveMatchesCounted, rows };
}
