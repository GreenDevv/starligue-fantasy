export const dynamic = "force-dynamic";

// PUT /api/admin/transfer-windows/[id] — modifie une fenêtre de transfert
// DELETE /api/admin/transfer-windows/[id] — supprime une fenêtre de transfert
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

const UpdateSchema = z.object({
  seasonId: z.string().min(1).optional(),
  label: z.string().min(1).max(100).optional(),
  opensAt: z.string().datetime().optional(),
  closesAt: z.string().datetime().optional(),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", details: parsed.error.issues } }, { status: 400 });
  }

  const existing = await prisma.transferWindow.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const opensAt = parsed.data.opensAt ? new Date(parsed.data.opensAt) : existing.opensAt;
  const closesAt = parsed.data.closesAt ? new Date(parsed.data.closesAt) : existing.closesAt;
  if (closesAt <= opensAt) {
    return NextResponse.json(
      { error: { code: "INVALID_RANGE", message: "La date de fermeture doit être après la date d'ouverture" } },
      { status: 400 }
    );
  }

  const window = await prisma.transferWindow.update({
    where: { id: params.id },
    data: { ...parsed.data, opensAt, closesAt },
    include: { season: { select: { id: true, label: true } } },
  });

  return NextResponse.json({
    data: {
      id: window.id,
      seasonId: window.seasonId,
      seasonLabel: window.season.label,
      label: window.label,
      opensAt: window.opensAt,
      closesAt: window.closesAt,
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  await prisma.transferWindow.delete({ where: { id: params.id } });
  return NextResponse.json({ data: { deleted: true } });
}