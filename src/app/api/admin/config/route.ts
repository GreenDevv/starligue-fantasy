// GET /api/admin/config — liste toutes les clés GameConfig
// PUT /api/admin/config — met à jour une clé GameConfig
// ARCHITECTURE.md §6.6

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function requireAdmin() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") return null;
  return session;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Accès refusé" } }, { status: 403 });
  }

  const configs = await prisma.gameConfig.findMany({ orderBy: { key: "asc" } });
  return NextResponse.json({ data: { configs } });
}

const PutSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().min(0).max(500),
});

export async function PUT(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Accès refusé" } }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "key et value requis", details: parsed.error.issues } },
      { status: 400 }
    );
  }

  const { key, value } = parsed.data;
  await prisma.gameConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });

  return NextResponse.json({ data: { key, value } });
}
