// Envoie une notification Web Push pour chaque nouvel événement live à chaque
// utilisateur abonné dont les préférences matchent (User.liveNotifications*, voir
// schema.prisma + GET /api/live/events pour le même filtrage côté toasts).
// Appelé depuis src/lib/ingestion/live-feed.ts juste après l'insertion des
// nouveaux MatchLiveEvent. Best-effort : une erreur d'envoi ne doit jamais faire
// échouer la synchro du score (fonctionnalité tertiaire).
import { prisma } from "@/lib/db";
import { sendWebPush } from "./send-web-push";
import { tallyGoalsBySequence, frenchOrdinal } from "@/lib/live/goal-tally";

interface NewLiveEventForNotif {
  text: string;
  icon: string;
  playerId: string | null;
  homeScore: number;
  awayScore: number;
  sequence: number;
}

const GOAL_ICONS = new Set(["goals", "goals_7m"]);

// Boutons présents sur chaque notification (ARCHITECTURE.md §27) : rejoindre le fil
// du match (même URL que le clic sur le corps de la notif) et accéder aux réglages
// de notifications live. 2 actions = le maximum affiché de façon fiable par les
// navigateurs qui les supportent ; dégrade silencieusement ailleurs (iOS Safari).
const STANDARD_ACTIONS = [
  { action: "view-match", title: "Voir le match" },
  { action: "settings", title: "Réglages" },
];

// Sélection commune : abonnés Web Push dont les préférences matchent ce match
// (notifs live activées, club filtré ou aucun filtre). `onlyMyPlayers` est
// interprété différemment par l'appelant selon qu'il s'agit d'un événement précis
// (notifyWebPushForLiveEvents, filtre par joueur exact) ou d'un moment de match
// (notifyWebPushForMatchMilestone, filtre par présence d'un joueur de l'effectif).
async function findLiveNotificationSubscribers(homeClubId: string, awayClubId: string) {
  return prisma.user.findMany({
    where: {
      liveNotificationsEnabled: true,
      webPushSubscriptions: { some: {} },
      OR: [
        { liveNotificationsClubIds: { isEmpty: true } },
        { liveNotificationsClubIds: { hasSome: [homeClubId, awayClubId] } },
      ],
    },
    select: {
      liveNotificationsOnlyMyPlayers: true,
      webPushSubscriptions: { select: { id: true, endpoint: true, p256dh: true, auth: true } },
      fantasyTeams: { select: { squad: { select: { playerId: true, player: { select: { clubId: true } } } } } },
    },
  });
}

type LiveNotificationSubscriber = Awaited<ReturnType<typeof findLiveNotificationSubscribers>>[number];

async function pushToSubscriber(
  user: Pick<LiveNotificationSubscriber, "webPushSubscriptions">,
  payload: { title: string; body: string; url: string; tag: string; image: string }
) {
  for (const sub of user.webPushSubscriptions) {
    const { expired } = await sendWebPush(sub, { ...payload, actions: STANDARD_ACTIONS });
    if (expired) {
      await prisma.webPushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
    }
  }
}

// "periods_finish" sert pour "Fin de la première mi-temps" ET "Fin du match" (voir
// src/lib/data-providers/lnh-scraper.provider.ts) — on distingue les deux par le
// texte pour enrichir le corps de la notif avec le score, comme demandé (mi-temps
// et fin de match doivent afficher le score, en plus des écussons déjà dans l'image).
function milestoneFromEvent(event: NewLiveEventForNotif): "halftime" | "fulltime" | null {
  if (event.icon !== "periods_finish") return null;
  if (/mi-temps/i.test(event.text)) return "halftime";
  if (/fin du match/i.test(event.text)) return "fulltime";
  return null;
}

export async function notifyWebPushForLiveEvents(
  matchId: string,
  homeClubId: string,
  awayClubId: string,
  events: NewLiveEventForNotif[]
): Promise<void> {
  if (events.length === 0) return;

  const candidates = await findLiveNotificationSubscribers(homeClubId, awayClubId);
  if (candidates.length === 0) return;

  const url = `/matches/${matchId}#match-events`;
  // Bannière écusson vs écusson (voir src/app/api/og/live-event/route.tsx) — un seul
  // appel généré une fois par match, pas par événement.
  const image = `/api/og/live-event?home=${homeClubId}&away=${awayClubId}`;

  // Noms courts des clubs, chargés une seule fois si besoin (mi-temps/fin de match
  // uniquement) pour ne pas alourdir le cas courant (buts, exclusions…).
  let homeShortName = "";
  let awayShortName = "";
  if (events.some((e) => milestoneFromEvent(e) !== null)) {
    const clubs = await prisma.club.findMany({
      where: { id: { in: [homeClubId, awayClubId] } },
      select: { id: true, shortName: true },
    });
    homeShortName = clubs.find((c) => c.id === homeClubId)?.shortName ?? "";
    awayShortName = clubs.find((c) => c.id === awayClubId)?.shortName ?? "";
  }

  // Total de buts du buteur dans CE match, pour l'ajouter au corps de la notif
  // ("3e but du match") — recalculé sur tout l'historique du match (pas seulement
  // ce batch), un joueur peut avoir marqué avant ce tick de cron.
  let goalTallyBySequence = new Map<number, number>();
  if (events.some((e) => GOAL_ICONS.has(e.icon) && e.playerId)) {
    const allGoalEvents = await prisma.matchLiveEvent.findMany({
      where: { matchId, icon: { in: [...GOAL_ICONS] } },
      select: { sequence: true, playerId: true },
    });
    goalTallyBySequence = tallyGoalsBySequence(allGoalEvents);
  }

  for (const event of events) {
    const milestone = milestoneFromEvent(event);
    const title = milestone === "halftime" ? "Mi-temps" : milestone === "fulltime" ? "Fin du match" : "Starligue Fantasy";
    const goalRank = GOAL_ICONS.has(event.icon) && event.playerId ? goalTallyBySequence.get(event.sequence) : undefined;
    const body = milestone
      ? `${homeShortName} ${event.homeScore} - ${event.awayScore} ${awayShortName}`
      : goalRank
        ? `${event.text} — ${frenchOrdinal(goalRank)} but du match`
        : event.text;

    for (const user of candidates) {
      if (user.liveNotificationsOnlyMyPlayers) {
        if (!event.playerId) continue;
        const owns = user.fantasyTeams.some((t) => t.squad.some((s) => s.playerId === event.playerId));
        if (!owns) continue;
      }

      await pushToSubscriber(user, { title, body, url, tag: `match-${matchId}`, image });
    }
  }
}

// Notification "moment de match" indépendante d'un événement précis (rappel avant
// coup d'envoi, coup d'envoi) — voir src/lib/ingestion/live-feed.ts
// notifyMatchKickoffMilestones et ARCHITECTURE.md §24. `onlyMyPlayers` est ici
// interprété comme "un joueur de mon effectif joue ce match" (il n'y a pas
// d'événement/joueur précis à comparer).
export async function notifyWebPushForMatchMilestone(
  matchId: string,
  homeClubId: string,
  awayClubId: string,
  notification: { title: string; body: string }
): Promise<void> {
  const candidates = await findLiveNotificationSubscribers(homeClubId, awayClubId);
  if (candidates.length === 0) return;

  const url = `/matches/${matchId}#match-events`;
  const image = `/api/og/live-event?home=${homeClubId}&away=${awayClubId}`;

  for (const user of candidates) {
    if (user.liveNotificationsOnlyMyPlayers) {
      const hasPlayerInMatch = user.fantasyTeams.some((t) =>
        t.squad.some((s) => s.player.clubId === homeClubId || s.player.clubId === awayClubId)
      );
      if (!hasPlayerInMatch) continue;
    }

    await pushToSubscriber(user, { ...notification, url, tag: `match-${matchId}`, image });
  }
}
