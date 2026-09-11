export const dynamic = "force-dynamic";

// GET /api/live/events?since=ISO — événements live récents (tous matchs en cours),
// enrichis pour l'affichage toast (src/components/live/LiveEventToaster.tsx) :
// infos match + clubs, sentiment (positive/negative/neutral), joueur résolu
// (photo, poste) si un nom a matché dans le texte lnh.fr, et `owned` (le joueur
// est dans l'effectif de l'utilisateur connecté, toutes ligues confondues) si
// authentifié. Accessible sans connexion (juste sans `owned`/mise en avant, et sans
// filtrage préférences puisqu'il n'y a pas de compte à filtrer).
// `since` permet un polling léger côté client (même convention que
// /api/leagues/[id]/chat) — sans lui, ne renvoie que les ~2 dernières minutes pour
// éviter de déverser tout l'historique au premier chargement.
//
// Filtrage par préférences (User.liveNotifications*, voir schema.prisma) appliqué
// ICI côté serveur, jamais côté client — un visiteur connecté qui a coupé les
// notifs live, filtré sur ses clubs suivis, ou sur "mes joueurs seulement" ne doit
// jamais recevoir les events exclus, même un instant.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { classifyLiveEventSentiment } from "@/lib/live/event-sentiment";

const DEFAULT_LOOKBACK_MS = 2 * 60 * 1000;
const MAX_EVENTS = 30;

export async function GET(request: Request) {
  const session = await auth();
  const url = new URL(request.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam && !Number.isNaN(Date.parse(sinceParam)) ? new Date(sinceParam) : new Date(Date.now() - DEFAULT_LOOKBACK_MS);

  let prefs: { liveNotificationsEnabled: boolean; liveNotificationsOnlyMyPlayers: boolean; liveNotificationsClubIds: string[] } | null =
    null;
  if (session?.user?.id) {
    prefs = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { liveNotificationsEnabled: true, liveNotificationsOnlyMyPlayers: true, liveNotificationsClubIds: true },
    });
  }

  // Notifs coupées : curseur renvoyé quand même (pour que le prochain poll parte
  // du bon `since`), mais aucun événement.
  if (prefs && !prefs.liveNotificationsEnabled) {
    return NextResponse.json({ data: { serverTime: new Date().toISOString(), events: [] } });
  }

  const clubFilter =
    prefs && prefs.liveNotificationsClubIds.length > 0
      ? {
          match: {
            OR: [
              { homeClubId: { in: prefs.liveNotificationsClubIds } },
              { awayClubId: { in: prefs.liveNotificationsClubIds } },
            ],
          },
        }
      : {};

  const events = await prisma.matchLiveEvent.findMany({
    where: { createdAt: { gt: since }, ...clubFilter },
    orderBy: { createdAt: "asc" },
    take: MAX_EVENTS,
    include: {
      match: {
        select: {
          id: true,
          homeClub: { select: { id: true, name: true, shortName: true, logoUrl: true } },
          awayClub: { select: { id: true, name: true, shortName: true, logoUrl: true } },
        },
      },
      player: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          position: true,
          photoUrl: true,
          photoOffsetX: true,
          photoOffsetY: true,
          photoZoom: true,
        },
      },
    },
  });

  let ownedPlayerIds = new Set<string>();
  if (session?.user?.id && events.some((e) => e.playerId)) {
    const owned = await prisma.fantasySquadPlayer.findMany({
      where: { fantasyTeam: { userId: session.user.id } },
      select: { playerId: true },
    });
    ownedPlayerIds = new Set(owned.map((o) => o.playerId));
  }

  const onlyMyPlayers = prefs?.liveNotificationsOnlyMyPlayers ?? false;
  const filtered = onlyMyPlayers ? events.filter((e) => e.playerId && ownedPlayerIds.has(e.playerId)) : events;

  return NextResponse.json({
    data: {
      serverTime: new Date().toISOString(),
      events: filtered.map((e) => ({
        id: e.id,
        matchId: e.matchId,
        homeClub: e.match.homeClub,
        awayClub: e.match.awayClub,
        minute: e.minute,
        period: e.period,
        icon: e.icon,
        text: e.text,
        homeScore: e.homeScore,
        awayScore: e.awayScore,
        sentiment: classifyLiveEventSentiment(e.icon),
        player: e.player
          ? {
              id: e.player.id,
              firstName: e.player.firstName,
              lastName: e.player.lastName,
              position: e.player.position,
              photoUrl: e.player.photoUrl,
              photoOffsetX: e.player.photoOffsetX,
              photoOffsetY: e.player.photoOffsetY,
              photoZoom: Number(e.player.photoZoom),
              owned: ownedPlayerIds.has(e.player.id),
            }
          : null,
      })),
    },
  });
}
