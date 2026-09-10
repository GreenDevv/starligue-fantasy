// Envoi des emails "la LNH a corrigé ses notes" aux managers impactés — étape 2,
// séparée de l'application des corrections (apply.ts). Un seul email par
// utilisateur, listant chacune de ses équipes impactées. Dédup via NotificationLog
// (dedupeKey unique) : rejouer l'envoi le même jour ne renvoie pas deux fois.
import { prisma } from "@/lib/db";
import { getResendClient, EMAIL_FROM } from "@/lib/email/resend-client";
import { buildLnhCorrectionEmail, type TeamImpactForEmail } from "./email";
import type { ImpactRow } from "./report";

export interface SendCorrectionEmailsResult {
  recipients: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
}

function dedupeKey(gameweekNumber: number, userId: string): string {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `lnh-correction:J${gameweekNumber}:${userId}:${day}`;
}

export async function sendLnhCorrectionEmails(
  gameweekNumber: number,
  rows: ImpactRow[]
): Promise<SendCorrectionEmailsResult> {
  const byUser = new Map<string, { userId: string; email: string; teams: TeamImpactForEmail[] }>();
  for (const r of rows) {
    const entry = byUser.get(r.userId) ?? { userId: r.userId, email: r.email, teams: [] };
    entry.teams.push({
      teamName: r.teamName,
      leagueName: r.leagueName,
      pointsBefore: r.pointsBefore,
      pointsAfter: r.pointsAfter,
      delta: r.delta,
      globalRankBefore: r.globalRankBefore,
      globalRankAfter: r.globalRankAfter,
      leagueRankBefore: r.leagueRankBefore,
      leagueRankAfter: r.leagueRankAfter,
      directCorrections: r.directCorrections,
      indirect: r.indirect,
    });
    byUser.set(r.userId, entry);
  }

  const users = [...byUser.values()];
  if (users.length === 0) {
    return { recipients: 0, sent: 0, skipped: 0, failed: 0, errors: [] };
  }

  const keys = users.map((u) => dedupeKey(gameweekNumber, u.userId));
  const alreadySent = new Set(
    (
      await prisma.notificationLog.findMany({
        where: { dedupeKey: { in: keys } },
        select: { dedupeKey: true },
      })
    ).map((l) => l.dedupeKey)
  );

  const recapUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://starliguefantasy.fr"}/fr/team`;

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  // Séquentiel : volumes faibles (une poignée de managers par lot de corrections),
  // évite de rafaler l'API Resend.
  for (const u of users) {
    const key = dedupeKey(gameweekNumber, u.userId);
    if (alreadySent.has(key)) {
      skipped++;
      continue;
    }
    try {
      const { subject, html } = buildLnhCorrectionEmail({
        gameweekNumber,
        teams: u.teams,
        recapUrl,
      });
      const resend = getResendClient();
      const { error } = await resend.emails.send({ from: EMAIL_FROM, to: u.email, subject, html });
      if (error) throw new Error(error.message);
      await prisma.notificationLog.create({ data: { userId: u.userId, dedupeKey: key } });
      sent++;
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${u.email}: ${msg}`);
      console.error("[lnh-correction-email]", u.email, e);
    }
  }

  return { recipients: users.length, sent, skipped, failed, errors };
}
