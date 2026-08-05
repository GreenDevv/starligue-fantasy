export const dynamic = "force-dynamic";

// POST /api/blocked-users { userId } — bloque un autre utilisateur (masque ses
// messages dans les chats de ligue partagés). Modération minimale requise par
// la guideline App Store 1.2 — ARCHITECTURE.md §21.
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const bodySchema = z.object({ userId: z.string().min(1) });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: parsed.error.message } }, { status: 400 });
  }
  if (parsed.data.userId === session.user.id) {
    return NextResponse.json(
      { error: { code: "CANNOT_BLOCK_SELF", message: "Impossible de te bloquer toi-même" } },
      { status: 400 }
    );
  }

  await prisma.blockedUser.upsert({
    where: { blockerId_blockedId: { blockerId: session.user.id, blockedId: parsed.data.userId } },
    update: {},
    create: { blockerId: session.user.id, blockedId: parsed.data.userId },
  });

  return NextResponse.json({ data: { ok: true } });
}
