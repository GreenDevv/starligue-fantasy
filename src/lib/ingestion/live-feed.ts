// Suivi minute par minute des matchs Starligue en direct. Appelé par le cron
// sync-live pendant les créneaux de match. Idempotent.
//
// Source du score/chrono : `eStatsChannels/index_ajax` (LnhScraperProvider.fetchLiveIndex,
// un seul appel pour tous les matchs du jour). L'ancien flux par match (view_tab_live,
// LnhScraperProvider.fetchLiveMatchState) s'est avéré ne PAS se remplir pendant un
// match réellement en cours (validé en direct le 11/09) — probablement une
// reconstitution post-match, pas un vrai flux temps réel. L'index donne le score et
// la période/minute de façon fiable.
//
// Source du détail événement par événement : /matchs/live/voir?channel=N + /ajaxlive
// (LnhScraperProvider.fetchLiveChannelFilename/fetchLiveEventsFeed), validé en direct
// le 11/09 (61 événements nominatifs récupérés en cours de match). Le `channelId` par
// match vient de l'index (même appel que le score), le `filename` (hash de cache,
// stable pour tout le match) est résolu une fois puis mis en cache dans
// Match.externalIds.lnh_live_channel_filename. Chaque événement est associé (best
// effort) à un joueur de l'effectif des 2 clubs du match, voir resolveEventPlayerId.
//
// Pour chaque match dans la fenêtre live (coup d'envoi dans [now-2h45, now+15min],
// statut SCHEDULED/LIVE) présent dans l'index, met à jour :
//   - Match.liveMinute / livePeriod / liveUpdatedAt
//   - Match.homeScore / awayScore  (l'index est plus frais que le calendrier)
//   - Match.status  → LIVE (le passage à FINISHED reste géré par la synchro
//     calendrier habituelle, qui détecte `scores is-finish` — l'index live ne liste
//     que les matchs en cours et ne donne pas de signal de fin fiable)
//   - MatchLiveEvent  → une ligne par événement lnh.fr, ajout seul (jamais de
//     doublon : sequence = position chronologique, on n'insère que ce qui dépasse
//     le dernier sequence déjà stocké)
//
//   - PlayerMatchStat (isLive=true) → Score LNH + stats de chaque joueur EN DIRECT,
//     lus dans la même réponse /ajaxlive que les événements (onglet "Stats match",
//     validé le 27/09). Notes PROVISOIRES : alimentent le score fantasy provisoire,
//     le classement live et la page match ; le calcul définitif (settle-gameweek /
//     computeGameweekScores) les ignore et attend le boxscore définitif, qui
//     repasse les lignes à isLive=false. Une ligne déjà définitive n'est jamais
//     réécrite par le live.
import { prisma } from "@/lib/db";
import {
  createLnhScraperProvider,
  boxscoreRowToStatFields,
  type ScrapedMatchBoxscoreRow,
} from "@/lib/data-providers/lnh-scraper.provider";
import { loadLnhResolutionContext, resolveLnhRow, type LnhResolutionContext } from "@/lib/ingestion/lnh-player-identity";
import { IngestionError } from "@/lib/data-providers/lnh-scraper.provider";
import type { LnhScraperProvider } from "@/lib/data-providers/lnh-scraper.provider";
import { resolveEventPlayerId, type EventPlayerCandidate } from "@/lib/live/resolve-event-player";
import { notifyWebPushForLiveEvents, notifyWebPushForMatchMilestone } from "@/lib/notifications/notify-live-events";

const WINDOW_BEFORE_MS = 15 * 60 * 1000;
const WINDOW_AFTER_MS = 2.75 * 60 * 60 * 1000;

export interface LiveFeedSyncResult {
  checked: number;
  updated: number;
  matches: {
    matchId: string;
    minute: number;
    period: string;
    score: string;
    finished: boolean;
    newEvents: number;
    liveStats: number;
  }[];
  errors: string[];
}

// Upsert des notes/stats PROVISOIRES d'un match en cours (isLive=true). Le tableau
// live n'a pas de lien profil : joueur retrouvé par dernier nom lnh.fr connu puis
// par notre nom (resolveLnhRow, même résolveur que le boxscore définitif). Si le match a déjà au moins une ligne définitive
// (isLive=false, boxscore final passé), on ne touche à rien. Retourne le nombre de
// lignes écrites.
async function upsertLiveStats(
  matchId: string,
  rows: ScrapedMatchBoxscoreRow[],
  resolution: LnhResolutionContext
): Promise<number> {
  if (rows.length === 0) return 0;
  const definitive = await prisma.playerMatchStat.count({ where: { matchId, isLive: false } });
  if (definitive > 0) return 0;

  const upserts: { playerId: string; fields: ReturnType<typeof boxscoreRowToStatFields> }[] = [];
  for (const row of rows) {
    const resolved = resolveLnhRow(resolution, row);
    if (!resolved) continue;
    upserts.push({ playerId: resolved.playerId, fields: { ...boxscoreRowToStatFields(row), isLive: true } });
  }
  if (upserts.length === 0) return 0;

  await prisma.$transaction(
    upserts.map(({ playerId, fields }) =>
      prisma.playerMatchStat.upsert({
        where: { matchId_playerId: { matchId, playerId } },
        create: { matchId, playerId, ...fields },
        update: fields,
      })
    )
  );
  return upserts.length;
}

// Résout/rafraîchit le flux live d'un match (/ajaxlive) : insère les nouveaux
// événements (delta only, associés best effort à un joueur de `rosterCandidates`)
// et upsert les notes provisoires des joueurs (upsertLiveStats). Ne jette jamais —
// une erreur ici ne doit pas empêcher la mise à jour du score (fonctionnalité
// secondaire).
async function syncMatchEvents(
  provider: LnhScraperProvider,
  matchId: string,
  channelId: string,
  externalIds: Record<string, string>,
  rosterCandidates: EventPlayerCandidate[],
  homeClubId: string,
  awayClubId: string,
  resolution: LnhResolutionContext
): Promise<{ inserted: number; liveStats: number; errors: string[] }> {
  const errors: string[] = [];
  let filename = externalIds.lnh_live_channel_filename;

  async function fetchFeed() {
    if (!filename) return null;
    try {
      return await provider.fetchLiveChannelFeed(channelId, filename);
    } catch (err) {
      errors.push(`events(${matchId}): ${String(err)}`);
      return null;
    }
  }

  let feed = await fetchFeed();
  if (feed === null) {
    // filename absent ou expiré (400) → (ré)résoudre puis réessayer une fois.
    try {
      const resolved = await provider.fetchLiveChannelFilename(channelId);
      if (resolved && resolved !== filename) {
        filename = resolved;
        await prisma.match.update({
          where: { id: matchId },
          data: { externalIds: { ...externalIds, lnh_live_channel_filename: resolved, lnh_live_channel_id: channelId } },
        });
        feed = await fetchFeed();
      }
    } catch (err) {
      errors.push(`filename(${matchId}): ${String(err)}`);
    }
  }
  if (!feed) return { inserted: 0, liveStats: 0, errors };

  let liveStats = 0;
  try {
    liveStats = await upsertLiveStats(matchId, feed.boxscore, resolution);
  } catch (err) {
    errors.push(`liveStats(${matchId}): ${String(err)}`);
  }

  const events = feed.events;
  if (events.length === 0) return { inserted: 0, liveStats, errors };

  const existingCount = await prisma.matchLiveEvent.count({ where: { matchId } });
  const newOnes = events.slice(existingCount);
  if (newOnes.length === 0) return { inserted: 0, liveStats, errors };

  const rows = newOnes.map((e, i) => ({
    matchId,
    sequence: existingCount + i,
    period: e.period,
    minute: e.minute,
    icon: e.icon,
    homeScore: e.homeScore,
    awayScore: e.awayScore,
    text: e.text,
    playerId: resolveEventPlayerId(e.text, rosterCandidates),
  }));

  const { count } = await prisma.matchLiveEvent.createMany({ data: rows, skipDuplicates: true });

  // Best-effort, ne bloque jamais la synchro du score : envoyé en tâche de fond,
  // erreurs avalées (déjà gérées/loggées dans notifyWebPushForLiveEvents/sendWebPush).
  void notifyWebPushForLiveEvents(matchId, homeClubId, awayClubId, rows).catch((err) =>
    console.warn(`[live-feed] notify(${matchId}):`, String(err))
  );

  return { inserted: count, liveStats, errors };
}

export async function syncLiveMatchFeeds(seasonId: string, _seasonsId: string): Promise<LiveFeedSyncResult> {
  const now = Date.now();
  const candidates = await prisma.match.findMany({
    where: {
      seasonId,
      status: { in: ["SCHEDULED", "LIVE"] },
      kickoffAt: { gte: new Date(now - WINDOW_AFTER_MS), lte: new Date(now + WINDOW_BEFORE_MS) },
    },
    select: {
      id: true,
      status: true,
      homeScore: true,
      awayScore: true,
      externalIds: true,
      kickoffAt: true,
      homeClubId: true,
      awayClubId: true,
    },
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

  // Effectif des clubs concernés, chargé une seule fois pour tout le tick (plutôt
  // qu'une requête par match) — sert à resolveEventPlayerId.
  const clubIds = [...new Set(candidates.flatMap((m) => [m.homeClubId, m.awayClubId]))];
  const rosterPlayers = await prisma.player.findMany({
    where: { seasonId, clubId: { in: clubIds } },
    select: { id: true, firstName: true, lastName: true, clubId: true },
  });
  const rosterByClub = new Map<string, EventPlayerCandidate[]>();
  for (const p of rosterPlayers) {
    const arr = rosterByClub.get(p.clubId) ?? [];
    arr.push({ id: p.id, firstName: p.firstName, lastName: p.lastName });
    rosterByClub.set(p.clubId, arr);
  }
  const resolution = await loadLnhResolutionContext(seasonId, clubIds);

  for (const match of candidates) {
    const externalIds = match.externalIds as Record<string, string>;
    const calendarsId = externalIds?.lnh_calendars_id;
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

    let newEvents = 0;
    let liveStats = 0;
    if (entry.channelId) {
      const rosterCandidates = [
        ...(rosterByClub.get(match.homeClubId) ?? []),
        ...(rosterByClub.get(match.awayClubId) ?? []),
      ];
      const { inserted, liveStats: statsWritten, errors } = await syncMatchEvents(
        provider,
        match.id,
        entry.channelId,
        externalIds ?? {},
        rosterCandidates,
        match.homeClubId,
        match.awayClubId,
        resolution
      );
      newEvents = inserted;
      liveStats = statsWritten;
      result.errors.push(...errors);
    }

    result.updated++;
    result.matches.push({
      matchId: match.id,
      minute: entry.minute,
      period: entry.period,
      score: `${entry.homeScore}-${entry.awayScore}`,
      finished: false,
      newEvents,
      liveStats,
    });
  }

  return result;
}

export interface KickoffMilestonesResult {
  reminders: number;
  kickoffs: number;
}

// Notifications "moment de match" indépendantes du feed d'événements nominatifs
// (ARCHITECTURE.md §24) : rappel avant coup d'envoi + notification au coup d'envoi.
// Auto-guérissant (pas besoin de détecter une transition de statut au bon tick) :
// à chaque appel, on relance tout ce qui est dans la fenêtre et pas encore marqué
// envoyé (`kickoffReminderSentAt`/`kickoffNotifiedAt`), qu'un run de cron ait été
// raté ou décalé n'a donc pas d'impact — au pire quelques minutes de retard.
// Appelée depuis /api/cron/sync-live, après syncLiveMatchFeeds.
export async function notifyMatchKickoffMilestones(
  seasonId: string,
  reminderLeadMinutes: number
): Promise<KickoffMilestonesResult> {
  const now = Date.now();
  const reminderWindowEnd = new Date(now + reminderLeadMinutes * 60_000);

  const dueForReminder = await prisma.match.findMany({
    where: {
      seasonId,
      status: "SCHEDULED",
      kickoffReminderSentAt: null,
      kickoffAt: { gt: new Date(now), lte: reminderWindowEnd },
    },
    select: {
      id: true,
      homeClubId: true,
      awayClubId: true,
      homeClub: { select: { shortName: true } },
      awayClub: { select: { shortName: true } },
    },
  });

  for (const match of dueForReminder) {
    await notifyWebPushForMatchMilestone(match.id, match.homeClubId, match.awayClubId, {
      title: `Coup d'envoi dans ${reminderLeadMinutes} min`,
      body: `${match.homeClub.shortName} - ${match.awayClub.shortName}`,
    });
    await prisma.match.update({ where: { id: match.id }, data: { kickoffReminderSentAt: new Date() } });
  }

  // Le passage à LIVE est déjà posé par syncLiveMatchFeeds (ci-dessus) dès que
  // l'index lnh.fr confirme un coup d'envoi réel — il suffit de rattraper ici tout
  // match LIVE pas encore notifié.
  const dueForKickoff = await prisma.match.findMany({
    where: { seasonId, status: "LIVE", kickoffNotifiedAt: null },
    select: {
      id: true,
      homeClubId: true,
      awayClubId: true,
      homeClub: { select: { shortName: true } },
      awayClub: { select: { shortName: true } },
    },
  });

  for (const match of dueForKickoff) {
    await notifyWebPushForMatchMilestone(match.id, match.homeClubId, match.awayClubId, {
      title: "Coup d'envoi",
      body: `${match.homeClub.shortName} - ${match.awayClub.shortName} : c'est parti !`,
    });
    await prisma.match.update({ where: { id: match.id }, data: { kickoffNotifiedAt: new Date() } });
  }

  return { reminders: dueForReminder.length, kickoffs: dueForKickoff.length };
}
