export const dynamic = "force-dynamic";

// POST /api/leagues/:id/chat/:messageId/report — signale un message du chat
// de ligue. Modération minimale requise par la guideline App Store 1.2
// (apps avec communication entre utilisateurs) — ARCHITECTURE.md §21.
// Idempotent : un même utilisateur ne peut signaler deux fois le même
// message (contrainte unique ChatMessageReport[messageId, reportedBy]).
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isLeagueMember } from "@/lib/leagues/standings";

export async function POST(
  request: Request,
  { params }: { params: { id: string; messageId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  if (!(await isLeagueMember(params.id, session.user.id))) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Tu n'es pas membre de cette ligue" } },
      { status: 403 }
    );
  }

  const message = await prisma.leagueChatMessage.findUnique({
    where: { id: params.messageId },
    select: { leagueId: true },
  });
  if (!message || message.leagueId !== params.id) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Message introuvable" } }, { status: 404 });
  }

  await prisma.chatMessageReport.upsert({
    where: { messageId_reportedBy: { messageId: params.messageId, reportedBy: session.user.id } },
    update: {},
    create: { messageId: params.messageId, reportedBy: session.user.id },
  });

  return NextResponse.json({ data: { ok: true } });
}
