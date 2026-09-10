export const dynamic = "force-dynamic";

// POST /api/admin/lnh-corrections/send-emails — ARCHITECTURE.md §4.3
// Body { gameweek, rows: ImpactRow[] } — les lignes du compte rendu renvoyé par
// /apply que l'admin a choisi de notifier. Un email par utilisateur (regroupe ses
// équipes), dédup NotificationLog.
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { sendLnhCorrectionEmails } from "@/lib/lnh-corrections/send-emails";
import type { ImpactRow } from "@/lib/lnh-corrections/report";

async function requireAdmin() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") return null;
  return session;
}

const CorrectionSummarySchema = z.object({
  playerId: z.string(),
  playerName: z.string(),
  club: z.string(),
  ratingBefore: z.number().nullable(),
  ratingAfter: z.number().nullable(),
  ratingChanged: z.boolean(),
  otherFieldCount: z.number(),
});

const RowSchema = z.object({
  teamId: z.string(),
  userId: z.string(),
  email: z.string().email(),
  teamName: z.string(),
  leagueName: z.string(),
  pointsBefore: z.number(),
  pointsAfter: z.number(),
  delta: z.number(),
  globalRankBefore: z.number().nullable(),
  globalRankAfter: z.number().nullable(),
  leagueRankBefore: z.number().nullable(),
  leagueRankAfter: z.number().nullable(),
  directCorrections: z.array(CorrectionSummarySchema),
  indirect: z.boolean(),
});

const BodySchema = z.object({
  gameweek: z.number().int().min(1).max(40),
  rows: z.array(RowSchema).min(1).max(2000),
});

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: parsed.error.message } }, { status: 400 });
  }

  try {
    const result = await sendLnhCorrectionEmails(parsed.data.gameweek, parsed.data.rows as ImpactRow[]);
    return NextResponse.json({ data: result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ error: { code: "SEND_ERROR", message } }, { status: 400 });
  }
}
