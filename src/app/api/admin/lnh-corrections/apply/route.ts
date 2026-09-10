export const dynamic = "force-dynamic";

// POST /api/admin/lnh-corrections/apply — ARCHITECTURE.md §4.3
// Body { gameweek: number, correctionKeys: string[] }
// Upsert des PlayerMatchStat sélectionnés + (si journée notée) recompute complet de
// la journée, puis renvoie le compte rendu par équipe. N'ENVOIE PAS d'email —
// l'admin relit le compte rendu puis déclenche /send-emails séparément.
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { IngestionError } from "@/lib/data-providers/lnh-scraper.provider";
import { applyGameweekCorrections } from "@/lib/lnh-corrections/apply";

async function requireAdmin() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") return null;
  return session;
}

const BodySchema = z.object({
  gameweek: z.number().int().min(1).max(40),
  correctionKeys: z.array(z.string().min(3).max(120)).min(1).max(1000),
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
    const data = await applyGameweekCorrections(parsed.data.gameweek, parsed.data.correctionKeys);
    return NextResponse.json({ data });
  } catch (e) {
    if (e instanceof IngestionError) {
      return NextResponse.json({ error: { code: "SCRAPER_ERROR", message: e.message } }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ error: { code: "APPLY_ERROR", message } }, { status: 400 });
  }
}
