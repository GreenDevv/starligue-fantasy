export const dynamic = "force-dynamic";

// POST /api/admin/lnh-corrections/dismiss — ARCHITECTURE.md §4.3
// Body { batchId } — classe un lot sans notifier les managers (les corrections
// restent appliquées, seul l'email d'explication est renoncé).
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { dismissBatch } from "@/lib/lnh-corrections/batches";

async function requireAdmin() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") return null;
  return session;
}

const BodySchema = z.object({ batchId: z.string().min(1) });

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: parsed.error.message } }, { status: 400 });
  }

  try {
    await dismissBatch(parsed.data.batchId);
    return NextResponse.json({ data: { dismissed: true } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ error: { code: "DISMISS_ERROR", message } }, { status: 400 });
  }
}
