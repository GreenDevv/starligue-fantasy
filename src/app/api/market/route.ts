export const dynamic = "force-dynamic";

// GET /api/market → liste enrichie du marché (valeur, tendance, points saison,
// rendement points/M, forme). Saison résolue via le cookie seasonMode.
// Voir src/lib/players/market-list.ts.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveSeasonMode } from "@/lib/team/active-team-context";
import { getMarketPlayers } from "@/lib/players/market-list";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Connexion requise" } }, { status: 401 });
  }

  const players = await getMarketPlayers(resolveSeasonMode());
  return NextResponse.json({ data: { players } });
}
