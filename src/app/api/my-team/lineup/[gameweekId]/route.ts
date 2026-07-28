export const dynamic = "force-dynamic";

// GET /api/my-team/lineup/:gameweekId — snapshot + points par joueur
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computePlayerPoints, parseScoringConfig } from "@/lib/scoring/engine";
import { resolveSeasonMode, resolveActiveTeamContext } from "@/lib/team/active-team-context";

interface SnapshotEntry {
  playerId: string;
  position: string;
  role: "STARTER" | "BENCH";
  purchasePrice: number;
}

export async function GET(
  req: Request,
  { params }: { params: { gameweekId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Connexion requise" } },
      { status: 401 }
    );
  }

  const userId = session.user.id;
  const explicitLeagueId = new URL(req.url).searchParams.get("league");
  const mode = resolveSeasonMode();
  const ctx = await resolveActiveTeamContext(userId, mode, explicitLeagueId);
  if (!ctx) {
    return NextResponse.json(
      { error: { code: "NO_ACTIVE_LEAGUE", message: "Aucune ligue active" } },
      { status: 404 }
    );
  }

  const lineup =
    mode === "simulation"
      ? await prisma.simulationLineup.findUnique({
          where: { simulationTeamId_gameweekId: { simulationTeamId: ctx.teamId, gameweekId: params.gameweekId } },
          include: { gameweek: { select: { id: true, number: true, isScored: true } } },
        })
      : await prisma.fantasyLineup.findUnique({
          where: { fantasyTeamId_gameweekId: { fantasyTeamId: ctx.teamId, gameweekId: params.gameweekId } },
          include: { gameweek: { select: { id: true, number: true, isScored: true } } },
        });

  if (!lineup) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Lineup introuvable" } },
      { status: 404 }
    );
  }

  // En simulation "scored" = ce lineup a déjà des points (chaque équipe/ligue peut
  // avancer différemment tant que l'avancée n'est pas globale, cf plan étape 6) ;
  // en live c'est le flag global Gameweek.isScored.
  const isScored = mode === "simulation" ? lineup.points !== null : lineup.gameweek.isScored;

  const entries = lineup.entries as unknown as SnapshotEntry[];
  const playerIds = entries.map((e) => e.playerId);

  const [players, rawStats, configs] = await Promise.all([
    prisma.player.findMany({
      where: { id: { in: playerIds } },
      include: { club: { select: { id: true, shortName: true, logoUrl: true } } },
    }),
    isScored
      ? prisma.playerMatchStat.findMany({
          where: {
            playerId: { in: playerIds },
            match: { gameweekId: params.gameweekId },
          },
          include: {
            match: {
              select: {
                homeClubId: true,
                awayClubId: true,
                homeScore: true,
                awayScore: true,
              },
            },
            player: { select: { clubId: true } },
          },
        })
      : Promise.resolve([]),
    prisma.gameConfig.findMany(),
  ]);

  const playerMap = new Map(players.map((p) => [p.id, p]));
  const scoringConfig = parseScoringConfig(
    Object.fromEntries(configs.map((c) => [c.key, c.value]))
  );

  // Build per-player stat + teamWon
  const statMap = new Map<
    string,
    { lnhRating: number | null; played: boolean; teamWon: boolean }
  >();
  for (const stat of rawStats) {
    const homeWon =
      stat.match.homeScore !== null &&
      stat.match.awayScore !== null &&
      stat.match.homeScore > stat.match.awayScore;
    const awayWon =
      stat.match.homeScore !== null &&
      stat.match.awayScore !== null &&
      stat.match.awayScore > stat.match.homeScore;
    const isHome = stat.player.clubId === stat.match.homeClubId;
    statMap.set(stat.playerId, {
      lnhRating: stat.lnhRating !== null ? Number(stat.lnhRating) : null,
      played: stat.played,
      teamWon: isHome ? homeWon : awayWon,
    });
  }

  const enrichedEntries = entries.map((e) => {
    const p = playerMap.get(e.playerId);
    const stat = statMap.get(e.playerId);
    const points =
      isScored && stat
        ? computePlayerPoints(
            {
              lnhRating: stat.lnhRating,
              played: stat.played,
              role: e.role,
              teamWon: stat.teamWon,
            },
            scoringConfig
          )
        : null;

    return {
      playerId: e.playerId,
      firstName: p?.firstName ?? "",
      lastName: p?.lastName ?? "",
      photoUrl: p?.photoUrl ?? null,
      photoOffsetX: p?.photoOffsetX ?? 50,
      photoOffsetY: p?.photoOffsetY ?? 50,
      photoZoom: p ? Number(p.photoZoom) : 1,
      position: e.position,
      role: e.role,
      purchasePrice: e.purchasePrice,
      club: p?.club ?? null,
      lnhRating: stat?.lnhRating ?? null,
      played: stat?.played ?? null,
      points,
    };
  });

  return NextResponse.json({
    data: {
      id: lineup.id,
      gameweekId: params.gameweekId,
      gameweekNumber: lineup.gameweek.number,
      isScored,
      bonus: lineup.bonus,
      totalPoints: lineup.points !== null ? Number(lineup.points) : null,
      entries: enrichedEntries,
    },
  });
}