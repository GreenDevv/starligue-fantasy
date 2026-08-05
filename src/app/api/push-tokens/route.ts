export const dynamic = "force-dynamic";

// POST /api/push-tokens — enregistre/rafraîchit le token push du device
// courant (app mobile Capacitor, ARCHITECTURE.md §20.2) | DELETE — désenregistre
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const registerSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["IOS", "ANDROID"]),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const parsed = registerSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: parsed.error.message } },
      { status: 400 }
    );
  }

  const { token, platform } = parsed.data;
  await prisma.pushToken.upsert({
    where: { token },
    update: { userId: session.user.id, platform },
    create: { userId: session.user.id, token, platform },
  });

  return NextResponse.json({ data: { ok: true } });
}

const unregisterSchema = z.object({
  token: z.string().min(1),
});

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const parsed = unregisterSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: parsed.error.message } },
      { status: 400 }
    );
  }

  await prisma.pushToken.deleteMany({
    where: { token: parsed.data.token, userId: session.user.id },
  });

  return NextResponse.json({ data: { ok: true } });
}
