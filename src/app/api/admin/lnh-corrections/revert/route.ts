export const dynamic = "force-dynamic";

// POST /api/admin/lnh-corrections/revert — ARCHITECTURE.md §4.3
// Body { gameweek, undo: UndoEntry[] } — le payload `undo` renvoyé par /apply.
// Restaure les valeurs de stats d'avant l'application puis rejoue le scoring.
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { revertGameweekCorrections } from "@/lib/lnh-corrections/apply";

async function requireAdmin() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") return null;
  return session;
}

const UndoEntrySchema = z.object({
  matchId: z.string().min(1),
  playerId: z.string().min(1),
  before: z.record(z.string(), z.union([z.number(), z.boolean(), z.null()])),
});

const BodySchema = z.object({
  gameweek: z.number().int().min(1).max(40),
  undo: z.array(UndoEntrySchema).min(1).max(1000),
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
    const result = await revertGameweekCorrections(parsed.data.gameweek, parsed.data.undo);
    return NextResponse.json({ data: result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ error: { code: "REVERT_ERROR", message } }, { status: 400 });
  }
}
