// Envoie une notification Web Push pour chaque nouvel événement live à chaque
// utilisateur abonné dont les préférences matchent (User.liveNotifications*, voir
// schema.prisma + GET /api/live/events pour le même filtrage côté toasts).
// Appelé depuis src/lib/ingestion/live-feed.ts juste après l'insertion des
// nouveaux MatchLiveEvent. Best-effort : une erreur d'envoi ne doit jamais faire
// échouer la synchro du score (fonctionnalité tertiaire).
import { prisma } from "@/lib/db";
import { sendWebPush } from "./send-web-push";

interface NewLiveEventForNotif {
  text: string;
  playerId: string | null;
}

export async function notifyWebPushForLiveEvents(
  matchId: string,
  homeClubId: string,
  awayClubId: string,
  events: NewLiveEventForNotif[]
): Promise<void> {
  if (events.length === 0) return;

  const candidates = await prisma.user.findMany({
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
      fantasyTeams: { select: { squad: { select: { playerId: true } } } },
    },
  });
  if (candidates.length === 0) return;

  const url = `/matches/${matchId}`;
  // Bannière écusson vs écusson (voir src/app/api/og/live-event/route.tsx) — un seul
  // appel généré une fois par match, pas par événement.
  const image = `/api/og/live-event?home=${homeClubId}&away=${awayClubId}`;

  for (const event of events) {
    for (const user of candidates) {
      if (user.liveNotificationsOnlyMyPlayers) {
        if (!event.playerId) continue;
        const owns = user.fantasyTeams.some((t) => t.squad.some((s) => s.playerId === event.playerId));
        if (!owns) continue;
      }

      const payload = { title: "Starligue Fantasy", body: event.text, url, tag: `match-${matchId}`, image };
      for (const sub of user.webPushSubscriptions) {
        const { expired } = await sendWebPush(sub, payload);
        if (expired) {
          await prisma.webPushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    }
  }
}
