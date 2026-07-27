export const dynamic = "force-dynamic";

// DELETE /api/admin/news/[id] — supprime une actu manuellement.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function requireAdmin() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") return null;
  return session;
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  await prisma.newsItem.delete({ where: { id: params.id } });
  return NextResponse.json({ data: { deleted: true } });
}
