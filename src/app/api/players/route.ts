export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveSeasonMode } from "@/lib/team/active-team-context";
import { SIMULATION_SEASON_LABEL } from "@/lib/simulation/constants";

const querySchema = z.object({
  position: z.enum(["GK", "LW", "LB", "CB", "RB", "RW", "PV"]).optional(),
  clubId: z.string().optional(),
  search: z.string().optional(),
  // Contourne le mode live/simulation résolu par cookie : utilisé par la recherche
  // de comparaison sur /players/[id], qui doit rester dans la saison du joueur
  // affiché quel que soit le toggle global de saison.
  seasonId: z.string().optional(),
  sortBy: z.enum(["marketValue", "lastName", "position"]).default("marketValue"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  // 500 : la saison simulation compte 393 joueurs (plus que les 252 actifs en live).
  perPage: z.coerce.number().int().min(1).max(500).default(50),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_QUERY", message: parsed.error.message } },
      { status: 400 }
    );
  }

  const { position, clubId, search, sortBy, order, page, perPage, seasonId } = parsed.data;

  const mode = resolveSeasonMode();
  const season = seasonId
    ? await prisma.season.findUnique({ where: { id: seasonId } })
    : mode === "simulation"
      ? await prisma.season.findUnique({ where: { label: SIMULATION_SEASON_LABEL } })
      : await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ data: { players: [], total: 0, page, perPage } });
  }

  const where = {
    seasonId: season.id,
    isActive: true,
    ...(position && { position }),
    ...(clubId && { clubId }),
    ...(search && {
      OR: [
        { firstName: { contains: search, mode: "insensitive" as const } },
        { lastName: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [total, players] = await Promise.all([
    prisma.player.count({ where }),
    prisma.player.findMany({
      where,
      include: { club: { select: { id: true, name: true, shortName: true, logoUrl: true } } },
      orderBy: { [sortBy]: order },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
  ]);

  // Tendance de valeur (▲/▼ vs le dernier changement) — les deux entrées les plus
  // récentes de PlayerValueHistory par joueur, regroupées en mémoire (dataset
  // borné à la page courante, même approche que src/lib/players/compute-best-xi.ts).
  const history = await prisma.playerValueHistory.findMany({
    where: { playerId: { in: players.map((p) => p.id) } },
    orderBy: { changedAt: "desc" },
    select: { playerId: true, value: true },
  });
  // history est trié desc globalement, ce qui préserve l'ordre relatif de chaque
  // joueur : les deux premières occurrences rencontrées pour un playerId donné
  // sont donc sa valeur la plus récente puis la précédente.
  const lastTwoByPlayer = new Map<string, { latest: number; previous?: number }>();
  for (const h of history) {
    const entry = lastTwoByPlayer.get(h.playerId);
    if (!entry) {
      lastTwoByPlayer.set(h.playerId, { latest: Number(h.value) });
    } else if (entry.previous === undefined) {
      entry.previous = Number(h.value);
    }
  }
  const trendByPlayer = new Map<string, "up" | "down">();
  for (const [playerId, { latest, previous }] of lastTwoByPlayer) {
    if (previous === undefined || latest === previous) continue;
    trendByPlayer.set(playerId, latest > previous ? "up" : "down");
  }

  return NextResponse.json({
    data: {
      players: players.map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position,
        marketValue: Number(p.marketValue),
        valuationPending: p.valuationPending,
        valueTrend: trendByPlayer.get(p.id) ?? null,
        isActive: p.isActive,
        photoUrl: p.photoUrl,
        club: p.club,
      })),
      total,
      page,
      perPage,
    },
  });
}