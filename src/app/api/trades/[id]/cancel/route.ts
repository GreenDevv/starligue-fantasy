export const dynamic = "force-dynamic";

// POST /api/trades/:id/cancel — le proposeur annule sa propre proposition PENDING.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveTradeStatus } from "@/lib/trades/proposal";
import { resolveSeasonMode } from "@/lib/team/active-team-context";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Connexion requise" } }, { status: 401 });
  }

  const mode = resolveSeasonMode();

  const proposal =
    mode === "simulation"
      ? await prisma.simulationTradeProposal.findUnique({
          where: { id: params.id },
          include: { proposingTeam: { select: { userId: true } } },
        })
      : await prisma.tradeProposal.findUnique({
          where: { id: params.id },
          include: { proposingTeam: { select: { userId: true } } },
        });
  if (!proposal) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Proposition introuvable" } }, { status: 404 });
  }
  if (proposal.proposingTeam.userId !== session.user.id) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Seul le proposeur peut annuler ce trade" } },
      { status: 403 }
    );
  }

  const now = new Date();
  const effectiveStatus = resolveTradeStatus(proposal.status, proposal.expiresAt, now);
  if (effectiveStatus !== "PENDING") {
    return NextResponse.json(
      { error: { code: "TRADE_NOT_PENDING", message: `Cette proposition n'est plus en attente (${effectiveStatus})` } },
      { status: 409 }
    );
  }

  if (mode === "simulation") {
    await prisma.simulationTradeProposal.update({ where: { id: proposal.id }, data: { status: "CANCELLED", respondedAt: now } });
  } else {
    await prisma.tradeProposal.update({ where: { id: proposal.id }, data: { status: "CANCELLED", respondedAt: now } });
  }
  return NextResponse.json({ data: { success: true } });
}