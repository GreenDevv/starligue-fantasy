export const dynamic = "force-dynamic";

// GET /api/my-team/ownership — mes équipes (toutes ligues confondues, mode courant
// live/simulation) et les joueurs que chacune possède. Utilisé côté client par les
// widgets qui listent des joueurs (StatLeaderCard) pour surligner "je le possède
// déjà", coloré par équipe.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveSeasonMode } from "@/lib/team/active-team-context";
import { getMyTeamsOwnership } from "@/lib/team/my-teams-ownership";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Connexion requise" } }, { status: 401 });
  }

  const mode = resolveSeasonMode();
  const teams = await getMyTeamsOwnership(session.user.id, mode);

  return NextResponse.json({ data: { teams } });
}