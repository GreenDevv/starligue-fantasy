// Cron hebdo (branché dans cron-results.yml, le soir) : détecte les corrections
// que la LNH a publiées a posteriori sur les dernières journées notées, les
// APPLIQUE + rejoue le scoring tout seul (données toujours alignées sur les notes
// officielles), puis prévient les ADMINS par email qu'il y a des lots à relire —
// l'envoi des emails aux MANAGERS reste une décision humaine (écran
// /admin/lnh-corrections). ARCHITECTURE.md §4.3.
import { prisma } from "@/lib/db";
import { getResendClient, EMAIL_FROM } from "@/lib/email/resend-client";
import { analyzeGameweekCorrections } from "./analyze";
import { applyGameweekCorrections } from "./apply";
import { buildAdminCorrectionRecapEmail, type AdminRecapBatch } from "./admin-recap-email";

export interface WeeklyCorrectionsResult {
  checkedGameweeks: number[];
  batches: {
    gameweekNumber: number;
    correctionCount: number;
    impactedTeams: number;
    batchId: string | null;
  }[];
  adminsEmailed: number;
}

async function lastScoredGameweekNumbers(seasonId: string, count: number): Promise<number[]> {
  const rows = await prisma.gameweek.findMany({
    where: { seasonId, isScored: true },
    orderBy: { number: "desc" },
    take: count,
    select: { number: true },
  });
  return rows.map((r) => r.number).sort((a, b) => a - b);
}

export async function runWeeklyCorrectionsCheck(opts?: {
  gameweekNumbers?: number[];
  lookback?: number;
}): Promise<WeeklyCorrectionsResult> {
  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) throw new Error("Aucune saison active");

  const gameweekNumbers =
    opts?.gameweekNumbers ?? (await lastScoredGameweekNumbers(season.id, opts?.lookback ?? 2));

  const batches: WeeklyCorrectionsResult["batches"] = [];
  const recapBatches: AdminRecapBatch[] = [];

  for (const gwNum of gameweekNumbers) {
    const analysis = await analyzeGameweekCorrections(gwNum);
    if (analysis.totalCorrections === 0) continue;

    const keys = analysis.matches.flatMap((m) => m.corrections.map((c) => c.key));
    const result = await applyGameweekCorrections(gwNum, keys, { appliedBy: "cron" });

    batches.push({
      gameweekNumber: gwNum,
      correctionCount: result.appliedCount,
      impactedTeams: result.impactRows.length,
      batchId: result.batchId,
    });

    if (result.impactRows.length > 0) {
      recapBatches.push({
        gameweekNumber: gwNum,
        correctionCount: result.appliedCount,
        impactedTeams: result.impactRows.length,
        ratingCorrections: analysis.ratingCorrections,
        topDeltas: result.impactRows
          .slice(0, 5)
          .map((r) => ({ teamName: r.teamName, delta: r.delta })),
      });
    }
  }

  let adminsEmailed = 0;
  if (recapBatches.length > 0) {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { email: true },
    });
    const adminUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://starliguefantasy.fr"}/fr/admin/lnh-corrections`;
    const { subject, html } = buildAdminCorrectionRecapEmail({ batches: recapBatches, adminUrl });

    for (const admin of admins) {
      if (!admin.email) continue;
      try {
        const resend = getResendClient();
        const { error } = await resend.emails.send({ from: EMAIL_FROM, to: admin.email, subject, html });
        if (error) throw new Error(error.message);
        adminsEmailed++;
      } catch (e) {
        console.error("[lnh-corrections][cron][admin-email]", admin.email, e);
      }
    }
  }

  return { checkedGameweeks: gameweekNumbers, batches, adminsEmailed };
}
