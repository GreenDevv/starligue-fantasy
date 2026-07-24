// GET  /api/predictions?gw=&leagueId=  → matchs pronostiquables d'une journée
//                                         (cotes + mon pronostic + verrouillage)
// POST /api/predictions                { matchId, outcome, leagueId? } → pose/modifie
//                                         mon pronostic sur un match
// ARCHITECTURE.md §14. v1 : jeu en direct uniquement — voir §14 pour l'extension
// Simulation (hors scope, piège anti-spoiler à vérifier d'abord).
//
// Journée "courante" = la première dont la deadline n'est pas encore passée
// (même résolution que la valeur par défaut de `gw`). Interdit de pronostiquer
// une journée AU-DELÀ de celle-ci (ex: J3 tant que J1 n'a pas sa deadline
// passée) — les journées déjà passées restent consultables (lecture seule, de
// toute façon verrouillées match par match via kickoffAt).
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveSeasonMode, resolveActiveTeamContext } from "@/lib/team/active-team-context";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Connexion requise" } }, { status: 401 });
  }

  const mode = resolveSeasonMode();
  if (mode === "simulation") {
    return NextResponse.json(
      { error: { code: "NOT_AVAILABLE_IN_SIMULATION", message: "Pronostics disponibles uniquement en jeu en direct pour le moment" } },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const leagueIdParam = url.searchParams.get("leagueId") ?? undefined;
  const ctx = await resolveActiveTeamContext(session.user.id, mode, leagueIdParam);
  if (!ctx) {
    return NextResponse.json({ error: { code: "NO_ACTIVE_LEAGUE", message: "Aucune ligue active" } }, { status: 404 });
  }

  const now = new Date();
  const gwParam = url.searchParams.get("gw");
  const gwNumber = gwParam ? parseInt(gwParam, 10) : null;

  const currentGameweek = await prisma.gameweek.findFirst({
    where: { seasonId: ctx.seasonId, deadlineAt: { gt: now } },
    orderBy: { number: "asc" },
  });

  if (gwNumber && !isNaN(gwNumber) && currentGameweek && gwNumber > currentGameweek.number) {
    return NextResponse.json(
      {
        error: {
          code: "GW_NOT_OPEN",
          message: `Journée ${gwNumber} pas encore ouverte aux pronostics — termine d'abord la journée ${currentGameweek.number}.`,
        },
      },
      { status: 400 }
    );
  }

  const gameweek =
    gwNumber && !isNaN(gwNumber)
      ? await prisma.gameweek.findUnique({ where: { seasonId_number: { seasonId: ctx.seasonId, number: gwNumber } } })
      : currentGameweek;

  if (!gameweek) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Journée introuvable" } }, { status: 404 });
  }

  const matches = await prisma.match.findMany({
    where: { gameweekId: gameweek.id },
    include: {
      homeClub: { select: { shortName: true, name: true, logoUrl: true } },
      awayClub: { select: { shortName: true, name: true, logoUrl: true } },
      predictionMarket: {
        include: { predictions: { where: { fantasyTeamId: ctx.teamId }, select: { outcome: true } } },
      },
    },
    orderBy: { kickoffAt: "asc" },
  });

  const data = matches.map((m) => ({
    matchId: m.id,
    kickoffAt: m.kickoffAt,
    locked: m.kickoffAt <= now,
    homeClub: m.homeClub,
    awayClub: m.awayClub,
    odds: m.predictionMarket
      ? {
          HOME: Number(m.predictionMarket.oddsHome),
          DRAW: Number(m.predictionMarket.oddsDraw),
          AWAY: Number(m.predictionMarket.oddsAway),
        }
      : null,
    myPick: m.predictionMarket?.predictions[0]?.outcome ?? null,
  }));

  return NextResponse.json({
    data: {
      gameweekNumber: gameweek.number,
      currentGameweekNumber: currentGameweek?.number ?? null,
      matches: data,
    },
  });
}

const bodySchema = z.object({
  matchId: z.string().min(1),
  outcome: z.enum(["HOME", "DRAW", "AWAY"]),
  leagueId: z.string().cuid().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Connexion requise" } }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: parsed.error.message } }, { status: 400 });
  }
  const { matchId, outcome } = parsed.data;

  const mode = resolveSeasonMode();
  if (mode === "simulation") {
    return NextResponse.json(
      { error: { code: "NOT_AVAILABLE_IN_SIMULATION", message: "Pronostics disponibles uniquement en jeu en direct pour le moment" } },
      { status: 400 }
    );
  }

  const ctx = await resolveActiveTeamContext(session.user.id, mode, parsed.data.leagueId);
  if (!ctx) {
    return NextResponse.json({ error: { code: "NO_ACTIVE_LEAGUE", message: "Aucune ligue active" } }, { status: 404 });
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { predictionMarket: true, gameweek: { select: { number: true } } },
  });
  if (!match || match.seasonId !== ctx.seasonId) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Match introuvable" } }, { status: 404 });
  }
  if (!match.predictionMarket) {
    return NextResponse.json(
      { error: { code: "MARKET_NOT_READY", message: "Cotes pas encore disponibles pour ce match" } },
      { status: 400 }
    );
  }
  if (match.kickoffAt <= new Date()) {
    return NextResponse.json(
      { error: { code: "MATCH_LOCKED", message: "Ce match a déjà commencé, pronostic verrouillé" } },
      { status: 400 }
    );
  }

  const currentGameweek = await prisma.gameweek.findFirst({
    where: { seasonId: ctx.seasonId, deadlineAt: { gt: new Date() } },
    orderBy: { number: "asc" },
  });
  if (currentGameweek && match.gameweek.number > currentGameweek.number) {
    return NextResponse.json(
      {
        error: {
          code: "GW_NOT_OPEN",
          message: `Journée ${match.gameweek.number} pas encore ouverte aux pronostics — termine d'abord la journée ${currentGameweek.number}.`,
        },
      },
      { status: 400 }
    );
  }

  const prediction = await prisma.prediction.upsert({
    where: { fantasyTeamId_marketId: { fantasyTeamId: ctx.teamId, marketId: match.predictionMarket.id } },
    update: { outcome },
    create: { fantasyTeamId: ctx.teamId, marketId: match.predictionMarket.id, outcome },
  });

  return NextResponse.json({ data: { matchId, outcome: prediction.outcome } });
}
