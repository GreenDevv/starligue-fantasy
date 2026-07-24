// POST /api/team/active-league — bascule la ligue courante (sélecteur multi-ligues)
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { setActiveLeagueCookie } from "@/lib/team/active-league";

const bodySchema = z.object({ leagueId: z.string().cuid() });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: parsed.error.message } },
      { status: 400 }
    );
  }

  const { leagueId } = parsed.data;
  const member = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId: session.user.id } },
    select: { leagueId: true },
  });

  if (!member) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Tu n'es pas membre de cette ligue" } },
      { status: 403 }
    );
  }

  const res = NextResponse.json({ data: { leagueId } });
  setActiveLeagueCookie(res, leagueId);
  return res;
}
