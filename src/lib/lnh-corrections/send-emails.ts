// Envoi des emails "la LNH a corrigé ses notes" aux managers d'un lot
// (LnhCorrectionBatch) — étape déclenchée par l'admin après relecture, jamais par
// le cron. Un seul email par utilisateur, listant chacune de ses équipes
// impactées. Dédup via NotificationLog (dedupeKey unique par lot + utilisateur).
import { prisma } from "@/lib/db";
import { getResendClient, EMAIL_FROM } from "@/lib/email/resend-client";
import { buildLnhCorrectionEmail, type TeamImpactForEmail } from "./email";
import { loadBatchReport } from "./batches";
import type { ImpactRow } from "./report";

export interface SendCorrectionEmailsResult {
  recipients: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export async function notifyCorrectionBatch(
  batchId: string,
  teamIds?: string[]
): Promise<SendCorrectionEmailsResult> {
  const report = await loadBatchReport(batchId);
  const wanted = teamIds ? new Set(teamIds) : null;
  const rows: ImpactRow[] = report.impactRows.filter((r) => !wanted || wanted.has(r.teamId));

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

  const keyFor = (userId: string) => `lnh-correction:${batchId}:${userId}`;
  const alreadySent = new Set(
    (
      await prisma.notificationLog.findMany({
        where: { dedupeKey: { in: users.map((u) => keyFor(u.userId)) } },
        select: { dedupeKey: true },
      })
    ).map((l) => l.dedupeKey)
  );

  const recapUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://starliguefantasy.fr"}/fr/team`;

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  // Séquentiel : volumes faibles, évite de rafaler l'API Resend.
  for (const u of users) {
    if (alreadySent.has(keyFor(u.userId))) {
      skipped++;
      continue;
    }
    try {
      const { subject, html } = buildLnhCorrectionEmail({
        gameweekNumber: report.gameweekNumber,
        teams: u.teams,
        recapUrl,
      });
      const resend = getResendClient();
      const { error } = await resend.emails.send({ from: EMAIL_FROM, to: u.email, subject, html });
      if (error) throw new Error(error.message);
      await prisma.notificationLog.create({ data: { userId: u.userId, dedupeKey: keyFor(u.userId) } });
      sent++;
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${u.email}: ${msg}`);
      console.error("[lnh-correction-email]", u.email, e);
    }
  }

  await prisma.lnhCorrectionBatch.update({
    where: { id: batchId },
    data: { notifiedAt: new Date(), notifiedCount: { increment: sent } },
  });

  return { recipients: users.length, sent, skipped, failed, errors };
}
