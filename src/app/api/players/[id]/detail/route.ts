// GET /api/players/:id/detail — données complètes de la page /players/[id]
// (respecte le curseur anti-spoiler simulation), utilisé par la comparaison de
// joueurs sur cette même page. Lecture publique, même convention que
// GET /api/players (pas d'auth requise, données déjà visibles sur le marché).
import { NextResponse } from "next/server";
import { getPlayerDetailData } from "@/lib/players/player-detail";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const data = await getPlayerDetailData(params.id);
  if (!data) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Joueur introuvable" } }, { status: 404 });
  }
  return NextResponse.json({ data });
}
