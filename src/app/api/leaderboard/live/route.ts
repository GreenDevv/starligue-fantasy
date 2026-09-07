export const dynamic = "force-dynamic";

// GET /api/leaderboard/live — classement général fantasy PROVISOIRE de la journée
// en cours (« Centre live », Lot 4). Renvoie 204 s'il n'y a rien à afficher
// (aucune journée en cours, ou aucun match noté). Pas d'auth : mêmes données que
// le classement général public.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getLiveFantasyLeaderboard } from "@/lib/standings/live-fantasy-leaderboard";

export async function GET() {
  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) return new NextResponse(null, { status: 204 });

  const board = await getLiveFantasyLeaderboard(season.id);
  if (!board) return new NextResponse(null, { status: 204 });

  return NextResponse.json({ data: board });
}
