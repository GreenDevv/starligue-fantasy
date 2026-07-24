export const dynamic = "force-dynamic";

// GET /api/players/:id/season-recap — chiffres clés de la saison 2025/2026
// (si dispo) pour le popup au survol pendant la construction d'effectif.
// data: null est une réponse valide (pas de saison précédente exploitable),
// pas une erreur. Lecture publique, même convention que /api/players/:id/detail.
import { NextResponse } from "next/server";
import { getPreviousSeasonRecap } from "@/lib/players/season-recap";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const data = await getPreviousSeasonRecap(params.id);
  return NextResponse.json({ data });
}