export const dynamic = "force-dynamic";

// GET  /api/leagues/:id/chat?since=ISO   → messages du salon (trash talk), triés
//                                           du plus ancien au plus récent ; `since`
//                                           permet un polling léger côté client
// POST /api/leagues/:id/chat { content } → poste un message
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isLeagueMember } from "@/lib/leagues/standings";
import { validateChatMessageContent } from "@/lib/leagues/chat";

const CHAT_PAGE_SIZE = 100;

export async function GET(request: Request, { params }: { params: { id: string } }) {
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

  const url = new URL(request.url);
  const since = url.searchParams.get("since");
  const sinceDate = since ? new Date(since) : null;

  const blocked = await prisma.blockedUser.findMany({
    where: { blockerId: session.user.id },
    select: { blockedId: true },
  });
  const blockedIds = blocked.map((b) => b.blockedId);

  const messages = await prisma.leagueChatMessage.findMany({
    where: {
      leagueId: params.id,
      ...(blockedIds.length > 0 ? { userId: { notIn: blockedIds } } : {}),
      ...(sinceDate && !isNaN(sinceDate.getTime()) ? { createdAt: { gt: sinceDate } } : {}),
    },
    orderBy: { createdAt: sinceDate ? "asc" : "desc" },
    take: CHAT_PAGE_SIZE,
    select: { id: true, content: true, createdAt: true, userId: true, user: { select: { name: true } } },
  });

  const ordered = sinceDate ? messages : messages.reverse();

  return NextResponse.json({
    data: {
      messages: ordered.map((m) => ({
        id: m.id,
        content: m.content,
        createdAt: m.createdAt,
        userId: m.userId,
        userName: m.user.name,
      })),
    },
  });
}

const bodySchema = z.object({ content: z.string().min(1).max(2000) });

export async function POST(request: Request, { params }: { params: { id: string } }) {
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

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: parsed.error.message } }, { status: 400 });
  }

  const validated = validateChatMessageContent(parsed.data.content);
  if (!validated.valid) {
    // INVALID_CHARACTERS remonté sous son propre code (plutôt qu'aplati sous
    // INVALID_INPUT comme EMPTY/TOO_LONG) : resolveApiError côté client
    // (LeagueChat.tsx) résout le message affiché uniquement à partir du code,
    // il lui faut donc un code dédié pour afficher un message spécifique
    // (leagues.errors.INVALID_CHARACTERS) plutôt que le générique "Champs invalides".
    if (validated.error?.code === "INVALID_CHARACTERS") {
      return NextResponse.json(
        { error: { code: "INVALID_CHARACTERS", message: "Les caractères < et > ne sont pas autorisés" } },
        { status: 400 }
      );
    }
    const message =
      validated.error?.code === "EMPTY"
        ? "Le message ne peut pas être vide"
        : `Message trop long (max ${validated.error && "max" in validated.error ? validated.error.max : ""} caractères)`;
    return NextResponse.json({ error: { code: "INVALID_INPUT", message } }, { status: 400 });
  }

  const message = await prisma.leagueChatMessage.create({
    data: { leagueId: params.id, userId: session.user.id, content: validated.content },
    select: { id: true, content: true, createdAt: true, userId: true, user: { select: { name: true } } },
  });

  return NextResponse.json({
    data: {
      message: {
        id: message.id,
        content: message.content,
        createdAt: message.createdAt,
        userId: message.userId,
        userName: message.user.name,
      },
    },
  });
}
