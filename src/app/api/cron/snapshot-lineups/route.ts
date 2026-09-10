export const dynamic = "force-dynamic";

// POST /api/cron/snapshot-lineups — ARCHITECTURE.md §6.7
// Gèle l'alignement de chaque équipe validée pour les journées dont la deadline
// vient de passer. Logique dans src/lib/scoring/snapshot-lineups.ts (partagée avec
// le pipeline automatique /api/cron/settle-gameweek). Idempotent.

import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { snapshotGameweekLineups } from "@/lib/scoring/snapshot-lineups";

export async function POST(request: Request) {
  if (!(await verifyCronAuth(request))) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const result = await snapshotGameweekLineups();
  return NextResponse.json({ data: result });
}
