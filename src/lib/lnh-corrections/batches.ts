// Lots de corrections LNH (LnhCorrectionBatch) : lecture des lots en attente de
// notification pour l'écran admin, marquage "ignoré". La création est dans
// apply.ts, l'envoi des emails dans send-emails.ts.
import { prisma } from "@/lib/db";
import type { CorrectionBatchReport } from "./apply";

export interface PendingBatchView {
  id: string;
  gameweekNumber: number;
  appliedAt: string;
  appliedBy: string;
  correctionCount: number;
  report: CorrectionBatchReport;
}

export async function getPendingBatches(): Promise<PendingBatchView[]> {
  const rows = await prisma.lnhCorrectionBatch.findMany({
    where: { notifiedAt: null, dismissedAt: null },
    orderBy: { appliedAt: "desc" },
    take: 20,
  });
  return rows.map((r) => ({
    id: r.id,
    gameweekNumber: r.gameweekNumber,
    appliedAt: r.appliedAt.toISOString(),
    appliedBy: r.appliedBy,
    correctionCount: r.correctionCount,
    report: r.report as unknown as CorrectionBatchReport,
  }));
}

export async function loadBatchReport(batchId: string): Promise<CorrectionBatchReport & { gameweekNumber: number }> {
  const batch = await prisma.lnhCorrectionBatch.findUniqueOrThrow({ where: { id: batchId } });
  const report = batch.report as unknown as CorrectionBatchReport;
  return { ...report, gameweekNumber: batch.gameweekNumber };
}

export async function dismissBatch(batchId: string): Promise<void> {
  await prisma.lnhCorrectionBatch.update({
    where: { id: batchId },
    data: { dismissedAt: new Date() },
  });
}
