export const dynamic = "force-dynamic";

// POST /api/admin/news/sync — déclenche manuellement la synchro actus (même
// logique que le cron quotidien /api/cron/sync-news, voir src/lib/news/sync.ts),
// pour ne pas attendre le prochain passage planifié (0 7 * * *).

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runNewsSync } from "@/lib/news/sync";

async function requireAdmin() {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") return null;
  return session;
}

export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ error: { code: "NO_SEASON", message: "Aucune saison active" } }, { status: 400 });
  }

  const sources = await runNewsSync(season.id);

  return NextResponse.json({ data: { season: season.label, sources } });
}
