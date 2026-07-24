export const dynamic = "force-dynamic";

// GET /api/leagues/:id/teams/:teamId/squad — effectif en lecture seule d'une équipe
// de la ligue (nécessaire pour proposer un trade : voir l'effectif adverse avant de
// choisir les joueurs demandés). Réservé aux membres de la ligue ; pas de budget ni
// d'infos privées exposées, seulement ce qui est nécessaire pour construire un trade.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isLeagueMember } from "@/lib/leagues/standings";
import { SIMULATION_SEASON_LABEL } from "@/lib/simulation/constants";

export async function GET(_req: Request, { params }: { params: { id: string; teamId: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Connexion requise" } }, { status: 401 });
  }

  if (!(await isLeagueMember(params.id, session.user.id))) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Tu n'es pas membre de cette ligue" } },
      { status: 403 }
    );
  }

  const league = await prisma.league.findUnique({
    where: { id: params.id },
    select: { season: { select: { label: true } } },
  });
  if (!league) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Ligue introuvable" } }, { status: 404 });
  }
  const isSimulation = league.season.label === SIMULATION_SEASON_LABEL;

  const squadInclude = {
    include: {
      player: {
        include: { club: { select: { id: true, name: true, shortName: true, logoUrl: true } } },
      },
    },
  } as const;

  const team = isSimulation
    ? await prisma.simulationTeam.findUnique({ where: { id: params.teamId }, include: { squad: squadInclude } })
    : await prisma.fantasyTeam.findUnique({ where: { id: params.teamId }, include: { squad: squadInclude } });

  if (!team || team.leagueId !== params.id) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Équipe introuvable" } }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      id: team.id,
      name: team.name,
      jerseyConfig: "jerseyConfig" in team ? team.jerseyConfig : null,
      squad: team.squad.map((s) => ({
        id: s.player.id,
        firstName: s.player.firstName,
        lastName: s.player.lastName,
        position: s.player.position,
        marketValue: Number(s.player.marketValue),
        photoUrl: s.player.photoUrl,
        isActive: s.player.isActive,
        club: s.player.club,
      })),
    },
  });
}