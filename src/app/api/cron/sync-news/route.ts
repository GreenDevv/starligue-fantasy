export const dynamic = "force-dynamic";

// POST /api/cron/sync-news — ARCHITECTURE.md §6.7/§10 (quotidien, 0 7 * * *)
// Scrape toutes les sources enregistrées (lnh.fr + clubs, src/lib/data-providers/news/registry.ts),
// classe (src/lib/news/classify.ts), dédoublonne (exact par dedupeKey + quasi-doublon
// cross-source, src/lib/news/dedupe.ts) et upsert les nouveaux NewsItem. Une source en
// panne n'interrompt jamais les autres (même convention défensive que le reste de
// l'ingestion, ARCHITECTURE.md §3.2/§15). Logique partagée avec le déclenchement
// manuel admin (POST /api/admin/news/sync) via src/lib/news/sync.ts.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron-auth";
import { runNewsSync } from "@/lib/news/sync";

export async function POST(req: Request) {
  if (!(await verifyCronAuth(req))) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Cron secret invalide" } }, { status: 401 });
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ error: { code: "NO_SEASON", message: "Aucune saison active" } }, { status: 400 });
  }

  const sources = await runNewsSync(season.id);

  return NextResponse.json({ data: { season: season.label, sources } });
}
