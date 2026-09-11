// Suivi minute par minute des matchs Starligue en direct. Appelé par le cron
// sync-live pendant les créneaux de match. Idempotent.
//
// Source : `eStatsChannels/index_ajax` (LnhScraperProvider.fetchLiveIndex, un seul
// appel pour tous les matchs du jour). L'ancien flux par match (view_tab_live,
// LnhScraperProvider.fetchLiveMatchState) s'est avéré ne PAS se remplir pendant un
// match réellement en cours (validé en direct le 11/09) — probablement une
// reconstitution post-match, pas un vrai flux temps réel. L'index donne le score et
// la période/minute de façon fiable, mais pas le détail événement par événement.
//
// Pour chaque match dans la fenêtre live (coup d'envoi dans [now-2h45, now+15min],
// statut SCHEDULED/LIVE) présent dans l'index, met à jour :
//   - Match.liveMinute / livePeriod / liveUpdatedAt
//   - Match.homeScore / awayScore  (l'index est plus frais que le calendrier)
//   - Match.status  → LIVE (le passage à FINISHED reste géré par la synchro
//     calendrier habituelle, qui détecte `scores is-finish` — l'index live ne liste
//     que les matchs en cours et ne donne pas de signal de fin fiable)
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

export async function syncLiveMatchFeeds(seasonId: string, _seasonsId: string): Promise<LiveFeedSyncResult> {
  const now = Date.now();
  const candidates = await prisma.match.findMany({
    where: {
      seasonId,
      status: { in: ["SCHEDULED", "LIVE"] },
      kickoffAt: { gte: new Date(now - WINDOW_AFTER_MS), lte: new Date(now + WINDOW_BEFORE_MS) },
    },
    select: { id: true, status: true, homeScore: true, awayScore: true, externalIds: true, kickoffAt: true },
  });

  const result: LiveFeedSyncResult = { checked: 0, updated: 0, matches: [], errors: [] };
  if (candidates.length === 0) return result;

  const provider = createLnhScraperProvider();

  let index;
  try {
    index = await provider.fetchLiveIndex();
  } catch (err) {
    const recoverable = err instanceof IngestionError ? err.recoverable : false;
    console.warn("[live-feed] index:", String(err));
    result.errors.push(`index: ${String(err)}`);
    if (!recoverable) throw err;
    return result;
  }
  const byCalendarsId = new Map(index.map((entry) => [entry.calendarsId, entry]));

  for (const match of candidates) {
    const calendarsId = (match.externalIds as Record<string, string>)?.lnh_calendars_id;
    if (!calendarsId) continue;
    result.checked++;

    const entry = byCalendarsId.get(calendarsId);
    if (!entry) continue; // match pas encore commencé / plus dans l'index live
    // L'index affiche un placeholder "1ère mi-temps 00:00" pour un match pas encore
    // commencé (juste avant le coup d'envoi réel) — ne pas le prendre pour argent
    // comptant tant que le coup d'envoi programmé n'est pas passé, sinon on
    // marquerait le match LIVE trop tôt.
    if (entry.minute === 0 && entry.period === "1H" && now < match.kickoffAt.getTime()) continue;

    await prisma.match.update({
      where: { id: match.id },
      data: {
        liveMinute: entry.minute,
        livePeriod: entry.period,
        liveUpdatedAt: new Date(),
        homeScore: entry.homeScore,
        awayScore: entry.awayScore,
        // Ne jamais rétrograder un match déjà FINISHED (sync calendrier / boxscore
        // font autorité pour l'état final).
        ...(match.status === "FINISHED" ? {} : { status: "LIVE" as const }),
      },
    });
    result.updated++;
    result.matches.push({
      matchId: match.id,
      minute: entry.minute,
      period: entry.period,
      score: `${entry.homeScore}-${entry.awayScore}`,
      finished: false,
    });
  }

  return result;
}
