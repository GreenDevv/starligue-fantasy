// POST /api/admin/simulation/revert-gameweek — annule la dernière journée avancée
// de la saison de simulation, globalement pour toutes les équipes à la fois.
// Symétrique de /api/admin/simulation/advance-gameweek. Réservé aux admins (même
// raison : action globale partagée, pas de contrôle par équipe/petite ligue).
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/require-admin";
import { revertSimulationSeasonGameweek } from "@/lib/simulation/admin-advance";

export async function POST() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Accès réservé aux admins" } }, { status: 403 });
  }

  const result = await revertSimulationSeasonGameweek();

  if (result.status === "already_at_start") {
    return NextResponse.json(
      { error: { code: "ALREADY_AT_START", message: "La saison simulée est déjà à son point de départ" } },
      { status: 400 }
    );
  }

  if (result.status === "conflict") {
    return NextResponse.json(
      { error: { code: "CONFLICT", message: "La saison a déjà été modifiée entretemps — réessaie" } },
      { status: 409 }
    );
  }

  return NextResponse.json({ data: result });
}
