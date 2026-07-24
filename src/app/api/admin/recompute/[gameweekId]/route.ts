export const dynamic = "force-dynamic";

// POST /api/admin/recompute/:gameweekId — ARCHITECTURE.md §6.6
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { computeGameweekScores } from "@/lib/scoring/compute";

export async function POST(
  _req: Request,
  { params }: { params: { gameweekId: string } },
) {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Accès refusé" } }, { status: 403 });
  }

  try {
    const result = await computeGameweekScores(params.gameweekId);
    return NextResponse.json({ data: result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ error: { code: "COMPUTE_ERROR", message } }, { status: 400 });
  }
}