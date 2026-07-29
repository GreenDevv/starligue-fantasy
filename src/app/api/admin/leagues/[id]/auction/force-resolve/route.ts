export const dynamic = "force-dynamic";

// POST /api/admin/leagues/:id/auction/force-resolve — résout le tour courant
// même si tous les membres n'ont pas soumis (fallback abandon/inactivité, §18.6)
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOrCreateCurrentRound, resolveRoundNow } from "@/lib/auction/round-service";

async function requireAdmin() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") return null;
  return session;
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Accès refusé" } }, { status: 403 });
  }

  const leagueId = params.id;
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { mode: true } });
  if (!league || league.mode !== "AUCTION") {
    return NextResponse.json({ error: { code: "NOT_AUCTION_LEAGUE" } }, { status: 400 });
  }

  const { round, finished } = await getOrCreateCurrentRound(leagueId);
  if (finished || round.status !== "OPEN") {
    return NextResponse.json({ error: { code: "ROUND_NOT_OPEN", message: "Aucun tour ouvert" } }, { status: 400 });
  }

  await resolveRoundNow(round.id);
  return NextResponse.json({ data: { resolved: true, roundNumber: round.roundNumber } });
}
