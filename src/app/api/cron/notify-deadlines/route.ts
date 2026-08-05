export const dynamic = "force-dynamic";

// POST /api/cron/notify-deadlines — ARCHITECTURE.md §20.2
// Rappelle par push (app mobile) l'alignement non finalisé avant la deadline
// de journée, et le pronostic manquant avant le verrouillage d'un match.
// v1 scope au jeu en direct uniquement (même restriction que les pronostics,
// voir src/lib/predictions/compute-odds.ts). Idempotent via NotificationLog
// (dedupeKey unique) : un run de cron qui chevauche une fenêtre déjà traitée
// ne renvoie rien.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron-auth";
import { parseNotificationLeadMinutes } from "@/lib/notifications/config";
import { selectUsersForLineupReminder, selectUsersForPredictionReminder } from "@/lib/notifications/deadline-reminders";
import { sendPushToUsers } from "@/lib/push/send-push-client";

/** Envoie les push non déjà loggés et marque leur dedupeKey — évite une double relance entre deux runs. */
async function notifyOnce(
  userIds: string[],
  dedupeKeyFor: (userId: string) => string,
  notification: { title: string; body: string; data?: Record<string, string> }
): Promise<number> {
  if (userIds.length === 0) return 0;

  const keys = userIds.map(dedupeKeyFor);
  const alreadySent = await prisma.notificationLog.findMany({
    where: { dedupeKey: { in: keys } },
    select: { dedupeKey: true },
  });
  const alreadySentKeys = new Set(alreadySent.map((l) => l.dedupeKey));

  const pendingUserIds = userIds.filter((userId) => !alreadySentKeys.has(dedupeKeyFor(userId)));
  if (pendingUserIds.length === 0) return 0;

  await sendPushToUsers(pendingUserIds, notification);
  await prisma.notificationLog.createMany({
    data: pendingUserIds.map((userId) => ({ userId, dedupeKey: dedupeKeyFor(userId) })),
    skipDuplicates: true,
  });

  return pendingUserIds.length;
}

export async function POST(request: Request) {
  if (!(await verifyCronAuth(request))) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ data: { lineupReminders: 0, predictionReminders: 0 } });
  }

  const configs = await prisma.gameConfig.findMany();
  const rawConfig = Object.fromEntries(configs.map((c) => [c.key, c.value]));
  const leadMinutes = parseNotificationLeadMinutes(rawConfig);

  const now = new Date();
  const windowEnd = new Date(now.getTime() + leadMinutes * 60_000);

  // --- Alignement non finalisé avant la deadline de journée ---
  const upcomingGameweeks = await prisma.gameweek.findMany({
    where: { seasonId: season.id, deadlineAt: { gt: now, lte: windowEnd }, isScored: false },
    select: { id: true },
  });

  let lineupReminders = 0;
  if (upcomingGameweeks.length > 0) {
    const teams = await prisma.fantasyTeam.findMany({
      where: { league: { seasonId: season.id } },
      select: { userId: true, isValidated: true, captainId: true },
    });
    const userIds = selectUsersForLineupReminder(teams);

    for (const gameweek of upcomingGameweeks) {
      lineupReminders += await notifyOnce(
        userIds,
        (userId) => `lineup-deadline:${gameweek.id}:${userId}`,
        {
          title: "Aligne ton équipe !",
          body: "La deadline approche, finalise ton alignement avant qu'il ne soit verrouillé.",
          data: { type: "lineup-deadline", gameweekId: gameweek.id },
        }
      );
    }
  }

  // --- Pronostic manquant avant le verrouillage d'un match ---
  const upcomingMatches = await prisma.match.findMany({
    where: {
      seasonId: season.id,
      status: "SCHEDULED",
      kickoffAt: { gt: now, lte: windowEnd },
      predictionMarket: { isNot: null },
    },
    select: { id: true, predictionMarket: { select: { id: true } } },
  });

  let predictionReminders = 0;
  if (upcomingMatches.length > 0) {
    const teams = await prisma.fantasyTeam.findMany({
      where: { league: { seasonId: season.id } },
      select: { id: true, userId: true },
    });

    for (const match of upcomingMatches) {
      const marketId = match.predictionMarket!.id;
      const predictions = await prisma.prediction.findMany({
        where: { marketId },
        select: { fantasyTeamId: true },
      });
      const userIds = selectUsersForPredictionReminder(
        teams.map((t) => ({ userId: t.userId, fantasyTeamId: t.id })),
        predictions.map((p) => p.fantasyTeamId)
      );

      predictionReminders += await notifyOnce(
        userIds,
        (userId) => `prediction-lock:${match.id}:${userId}`,
        {
          title: "Pronostic bientôt verrouillé",
          body: "Fais ton pronostic avant le coup d'envoi pour ne pas rater le multiplicateur.",
          data: { type: "prediction-lock", matchId: match.id },
        }
      );
    }
  }

  return NextResponse.json({ data: { lineupReminders, predictionReminders } });
}
