export const dynamic = "force-dynamic";

// DELETE /api/blocked-users/:userId — débloque un utilisateur.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(request: Request, { params }: { params: { userId: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  await prisma.blockedUser.deleteMany({
    where: { blockerId: session.user.id, blockedId: params.userId },
  });

  return NextResponse.json({ data: { ok: true } });
}
