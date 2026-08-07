export const dynamic = "force-dynamic";

// POST /api/admin/news/sync — déclenche manuellement la synchro actus (même
// logique que le cron quotidien /api/cron/sync-news, voir src/lib/news/sync.ts),
// pour ne pas attendre le prochain passage planifié (0 7 * * *). Différence
// volontaire avec le cron (demande explicite du 2026-08-07) : fenêtre élargie à
// MANUAL_SYNC_WINDOW_DAYS jours (au lieu d'"aujourd'hui seulement"), les articles
// plus vieux qu'aujourd'hui étant renvoyés en pending (jamais auto-publiés) pour
// validation via POST /api/admin/news/sync/confirm — un admin est là pour
// trancher, contrairement au cron sans supervision.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runNewsSync } from "@/lib/news/sync";

const MANUAL_SYNC_WINDOW_DAYS = 3; // aujourd'hui + 2 jours précédents

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

  const sources = await runNewsSync(season.id, { windowDays: MANUAL_SYNC_WINDOW_DAYS });

  return NextResponse.json({ data: { season: season.label, sources } });
}
