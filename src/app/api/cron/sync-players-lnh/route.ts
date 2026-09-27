export const dynamic = "force-dynamic";

// POST /api/cron/sync-players-lnh
// Rattache les joueurs lnh.fr de la saison active à leur Player par slug de profil
// lnh.fr (Player.externalIds.lnh_slug / lnh_name) et crée ceux qui manquent
// (idempotent : retrouvés par slug au run suivant). Remplace l'ancien rapprochement
// par nom seul, qui aurait créé un doublon pour un joueur renommé par la LNH (MONTE,
// 27/09). Logique : src/lib/ingestion/lnh-roster-identity-sync.ts (aussi lançable en
// dry-run via scripts/sync-lnh-player-identities.ts).

import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { IngestionError } from "@/lib/data-providers/lnh-scraper.provider";
import { syncLnhRosterIdentities } from "@/lib/ingestion/lnh-roster-identity-sync";
import { prisma } from "@/lib/db";

// Valeur marchande d'un joueur créé par la synchro (GameConfig
// NEW_PLAYER_MARKET_VALUE, repli = valeur historique de ce cron).
const FALLBACK_NEW_PLAYER_MARKET_VALUE = 7.0;

export async function POST(req: Request) {
  if (!(await verifyCronAuth(req))) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const configured = await prisma.gameConfig.findUnique({ where: { key: "NEW_PLAYER_MARKET_VALUE" } });
  const parsedValue = configured ? Number(configured.value) : NaN;
  const defaultMarketValue = Number.isFinite(parsedValue) ? parsedValue : FALLBACK_NEW_PLAYER_MARKET_VALUE;

  try {
    const report = await syncLnhRosterIdentities({ apply: true, createMissing: true, defaultMarketValue });
    return NextResponse.json({ data: report });
  } catch (e) {
    if (e instanceof IngestionError) {
      return NextResponse.json(
        { error: { code: "SCRAPER_ERROR", message: e.message, recoverable: e.recoverable } },
        { status: 502 }
      );
    }
    if (e instanceof Error && e.message === "NO_SEASON") {
      return NextResponse.json({ error: { code: "NO_SEASON", message: "Aucune saison active" } }, { status: 400 });
    }
    throw e;
  }
}
