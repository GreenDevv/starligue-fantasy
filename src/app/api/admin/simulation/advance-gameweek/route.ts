export const dynamic = "force-dynamic";

// POST /api/admin/simulation/advance-gameweek — avance la saison de simulation
// d'une journée, globalement pour toutes les équipes validées à la fois. Réservé
// aux admins (voir plan de fusion live/simulation, étape 6) : remplace l'ancien
// POST /api/simulation/advance, déclenchable par n'importe quel joueur pour sa
// seule équipe.
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/require-admin";
import { advanceSimulationSeasonGameweek } from "@/lib/simulation/admin-advance";

export async function POST() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Accès réservé aux admins" } }, { status: 403 });
  }

  const result = await advanceSimulationSeasonGameweek();

  if (result.status === "season_complete") {
    return NextResponse.json(
      { error: { code: "SEASON_COMPLETE", message: "Toutes les journées de la saison simulée ont déjà été jouées" } },
      { status: 400 }
    );
  }

  if (result.status === "conflict") {
    return NextResponse.json(
      { error: { code: "CONFLICT", message: "La saison a déjà été avancée entretemps — réessaie" } },
      { status: 409 }
    );
  }

  return NextResponse.json({ data: result });
}