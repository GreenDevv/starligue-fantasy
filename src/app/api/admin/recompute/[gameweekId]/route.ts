export const dynamic = "force-dynamic";

// POST /api/admin/recompute/:gameweekId — ARCHITECTURE.md §6.6
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeGameweekScores } from "@/lib/scoring/compute";
import { generateWeeklyNews } from "@/lib/news/generate-weekly-news";

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

    // Régénère aussi les actus dérivées (équipe type / meilleures perfs) — même
    // logique que le cron compute-scores, encapsulée pour qu'un échec de génération
    // ne transforme pas un recompute réussi en erreur.
    try {
      const gw = await prisma.gameweek.findUnique({
        where: { id: params.gameweekId },
        select: { seasonId: true, number: true },
      });
      if (gw) await generateWeeklyNews(gw.seasonId, params.gameweekId, gw.number);
    } catch (newsError) {
      console.error("[recompute][weekly-news]", newsError);
    }

    return NextResponse.json({ data: result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ error: { code: "COMPUTE_ERROR", message } }, { status: 400 });
  }
}