// Suivi minute par minute des matchs Starligue en direct — feed lnh.fr
// (contents_action=view_tab_live). Appelé par le cron sync-live pendant les
// créneaux de match. Idempotent.
//
// Pour chaque match dans la fenêtre live (coup d'envoi dans [now-2h45, now+15min],
// statut SCHEDULED/LIVE), interroge le feed et met à jour :
//   - Match.liveMinute / livePeriod / liveUpdatedAt
//   - Match.homeScore / awayScore  (le feed est plus frais que le calendrier)
//   - Match.status  → LIVE dès qu'il y a des événements, FINISHED au coup de sifflet
//
// N'ingère PAS le boxscore (notes joueurs) : les notes ne sont publiées qu'après le
// match, c'est le rôle de sync-ratings / settle-gameweek.
import { prisma } from "@/lib/db";
import { createLnhScraperProvider } from "@/lib/data-providers/lnh-scraper.provider";
import { IngestionError } from "@/lib/data-providers/lnh-scraper.provider";

const WINDOW_BEFORE_MS = 15 * 60 * 1000;
const WINDOW_AFTER_MS = 2.75 * 60 * 60 * 1000;

export interface LiveFeedSyncResult {
  checked: number;
  updated: number;
  matches: { matchId: string; minute: number; period: string; score: string; finished: boolean }[];
  errors: string[];
}

export async function syncLiveMatchFeeds(seasonId: string, seasonsId: string): Promise<LiveFeedSyncResult> {
  const now = Date.now();
  const candidates = await prisma.match.findMany({
    where: {
      seasonId,
      status: { in: ["SCHEDULED", "LIVE"] },
      kickoffAt: { gte: new Date(now - WINDOW_AFTER_MS), lte: new Date(now + WINDOW_BEFORE_MS) },
    },
    select: { id: true, status: true, homeScore: true, awayScore: true, externalIds: true },
  });

  const result: LiveFeedSyncResult = { checked: 0, updated: 0, matches: [], errors: [] };
  if (candidates.length === 0) return result;

  const provider = createLnhScraperProvider();

  for (const match of candidates) {
    const calendarsId = (match.externalIds as Record<string, string>)?.lnh_calendars_id;
    if (!calendarsId) continue;
    result.checked++;

    let state;
    try {
      state = await provider.fetchLiveMatchState(calendarsId, seasonsId);
    } catch (err) {
      const recoverable = err instanceof IngestionError ? err.recoverable : false;
      console.warn(`[live-feed] ${match.id}:`, String(err));
      result.errors.push(`${match.id}: ${String(err)}`);
      if (!recoverable) throw err;
      continue;
    }

    if (!state) continue; // feed vide → match pas encore commencé

    const nextStatus = state.finished ? "FINISHED" : "LIVE";
    await prisma.match.update({
      where: { id: match.id },
      data: {
        liveMinute: state.minute,
        livePeriod: state.period,
        liveUpdatedAt: new Date(),
        homeScore: state.homeScore,
        awayScore: state.awayScore,
        // Ne jamais rétrograder un match déjà FINISHED (sync calendrier / boxscore
        // font autorité pour l'état final).
        ...(match.status === "FINISHED" ? {} : { status: nextStatus }),
      },
    });
    result.updated++;
    result.matches.push({
      matchId: match.id,
      minute: state.minute,
      period: state.period,
      score: `${state.homeScore}-${state.awayScore}`,
      finished: state.finished,
    });
  }

  return result;
}
