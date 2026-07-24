// GET /api/stats/leaders?statKey=&scope=season|gameweek|average&seasonId=&gameweekNumber=
// Top 5 d'une ligne de stat détaillée (src/lib/stats/stat-lines.ts) : accumulée
// depuis le début de la saison, pour une seule journée (par défaut la dernière
// journée disposant de stats), ou en moyenne par match joué (average = season ÷
// nombre de matchs joués). seasonId cible indifféremment la saison active
// 2026/27 ou la saison Mode Simulation 2025/26 — Player/Club/Match/PlayerMatchStat
// sont partagés (ARCHITECTURE.md §5).
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Position } from "@prisma/client";
import { prisma } from "@/lib/db";
import { STAT_LINE_KEYS } from "@/lib/stats/stat-lines";
import { COMPUTED_STAT_LINE_KEYS } from "@/lib/stats/computed-stat-lines";
import { computePlayerPoints, parseScoringConfig } from "@/lib/scoring/engine";

const ALL_STAT_KEYS = [...STAT_LINE_KEYS, ...COMPUTED_STAT_LINE_KEYS] as [string, ...string[]];

const querySchema = z.object({
  statKey: z.enum(ALL_STAT_KEYS),
  scope: z.enum(["season", "gameweek", "average"]),
  seasonId: z.string().min(1),
  gameweekNumber: z.coerce.number().int().min(1).optional(),
});

interface LeaderRow {
  playerId: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  position: Position;
  club: { shortName: string; logoUrl: string | null };
  value: number;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_QUERY", message: parsed.error.message } },
      { status: 400 }
    );
  }
  const { statKey, scope, seasonId } = parsed.data;

  // Résout la journée cible pour scope=gameweek : celle demandée, ou par défaut la
  // dernière journée de la saison disposant de stats de match.
  let gameweekNumber = parsed.data.gameweekNumber ?? null;
  let gameweekId: string | null = null;
  if (scope === "gameweek") {
    const target = gameweekNumber
      ? await prisma.gameweek.findUnique({
          where: { seasonId_number: { seasonId, number: gameweekNumber } },
          select: { id: true, number: true },
        })
      : await prisma.gameweek.findFirst({
          where: { seasonId, matches: { some: { playerStats: { some: {} } } } },
          orderBy: { number: "desc" },
          select: { id: true, number: true },
        });
    if (!target) {
      return NextResponse.json({ data: { statKey, scope, gameweekNumber: null, leaders: [] } });
    }
    gameweekId = target.id;
    gameweekNumber = target.number;
  }

  // average utilise la même fenêtre que season (toute la saison) : c'est un ratio
  // sum/matchesPlayed calculé après coup, pas une fenêtre de matchs différente.
  const matchWhere = scope === "gameweek" ? { seasonId, gameweekId: gameweekId! } : { seasonId };

  let ranked: { playerId: string; value: number }[];

  if (statKey === "fantasyPoints") {
    // Points fantasy dans l'hypothèse fixe titulaire + pas capitaine, quel qu'ait
    // été l'alignement réel du joueur ce jour-là (même formule que la colonne
    // "Pts (tit.)" de la fiche joueur) — pas une colonne PlayerMatchStat sommable,
    // donc calculé ligne par ligne plutôt que via groupBy.
    const configs = await prisma.gameConfig.findMany();
    const scoringConfig = parseScoringConfig(Object.fromEntries(configs.map((c) => [c.key, c.value])));

    const rows = await prisma.playerMatchStat.findMany({
      where: { match: matchWhere, played: true, lnhRating: { not: null } },
      select: {
        playerId: true,
        lnhRating: true,
        player: { select: { clubId: true } },
        match: { select: { homeClubId: true, awayClubId: true, homeScore: true, awayScore: true } },
      },
    });

    const sumByPlayer = new Map<string, number>();
    const countByPlayer = new Map<string, number>();
    for (const row of rows) {
      const isHome = row.player.clubId === row.match.homeClubId;
      const teamWon =
        row.match.homeScore !== null &&
        row.match.awayScore !== null &&
        (isHome ? row.match.homeScore > row.match.awayScore : row.match.awayScore > row.match.homeScore);
      const points = computePlayerPoints(
        { lnhRating: Number(row.lnhRating), played: true, role: "STARTER", teamWon },
        scoringConfig
      );
      sumByPlayer.set(row.playerId, (sumByPlayer.get(row.playerId) ?? 0) + points);
      countByPlayer.set(row.playerId, (countByPlayer.get(row.playerId) ?? 0) + 1);
    }

    ranked = Array.from(sumByPlayer.entries())
      .map(([playerId, sum]) => {
        const matches = countByPlayer.get(playerId) ?? 0;
        const value = scope === "average" && matches > 0 ? Math.round((sum / matches) * 10) / 10 : Math.round(sum * 10) / 10;
        return { playerId, value };
      })
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  } else if (statKey === "shotPercentage" && (scope === "season" || scope === "average")) {
    // Sommer des pourcentages par match n'a pas de sens (favoriserait les joueurs
    // ayant joué le plus de matchs) — la vraie stat est sum(goalsTotal)/sum(shotsTotal),
    // déjà un ratio "par match" par construction : pas de division supplémentaire
    // pour scope=average.
    const totals = await prisma.playerMatchStat.groupBy({
      by: ["playerId"],
      where: { match: matchWhere },
      _sum: { goalsTotal: true, shotsTotal: true },
    });
    ranked = totals
      .filter((t) => (t._sum.shotsTotal ?? 0) > 0)
      .map((t) => ({
        playerId: t.playerId,
        value: Math.round((100 * (t._sum.goalsTotal ?? 0)) / t._sum.shotsTotal! * 100) / 100,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  } else {
    // statKey validé par l'enum Zod ci-dessus (STAT_LINE_KEYS) — groupBy dynamique,
    // le typage généré par Prisma ne permet pas d'indexer _sum par une variable
    // (template-literal type check "needs to be provided in by"), d'où le passage
    // par `any` en frontière d'appel plutôt que de dupliquer 13 branches. Tri et
    // top 5 faits en JS plutôt que via orderBy/take Prisma : Postgres trie NULLS
    // FIRST par défaut en DESC, ce qui remonterait les joueurs sans valeur du tout
    // (ex: gardiens sur goalsTotal, dont le SUM est NULL car aucune ligne non-null)
    // avant les vrais leaders — piège vérifié en local sur ce jeu de données.
    const groupByArgs = {
      by: ["playerId"],
      where: { match: matchWhere },
      _sum: { [statKey]: true },
    };
    const grouped = (await (prisma.playerMatchStat.groupBy as (args: unknown) => Promise<unknown>)(
      groupByArgs
    )) as Array<{ playerId: string; _sum: Record<string, number | { toNumber(): number } | null> }>;

    // scope=average : divise par le nombre de matchs joués (played=true) sur la
    // même fenêtre — second groupBy dédié plutôt qu'un _count filtré dans le
    // premier (Prisma ne permet pas un where différent par agrégat dans un même groupBy).
    let matchesPlayedByPlayer: Map<string, number> | null = null;
    if (scope === "average") {
      const playedCounts = await prisma.playerMatchStat.groupBy({
        by: ["playerId"],
        where: { match: matchWhere, played: true },
        _count: { _all: true },
      });
      matchesPlayedByPlayer = new Map(playedCounts.map((c) => [c.playerId, c._count._all]));
    }

    ranked = grouped
      .map((g) => {
        const raw = g._sum[statKey];
        const sum = raw === null || raw === undefined ? null : typeof raw === "number" ? raw : raw.toNumber();
        if (sum === null) return { playerId: g.playerId, value: null };
        if (matchesPlayedByPlayer) {
          const matches = matchesPlayedByPlayer.get(g.playerId) ?? 0;
          const value = matches > 0 ? Math.round((sum / matches) * 100) / 100 : null;
          return { playerId: g.playerId, value };
        }
        return { playerId: g.playerId, value: sum };
      })
      .filter((r): r is { playerId: string; value: number } => r.value !== null && r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }

  const players = await prisma.player.findMany({
    where: { id: { in: ranked.map((r) => r.playerId) } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
      position: true,
      club: { select: { shortName: true, logoUrl: true } },
    },
  });
  const playerById = new Map(players.map((p) => [p.id, p]));

  const leaders: LeaderRow[] = [];
  for (const r of ranked) {
    const p = playerById.get(r.playerId);
    if (!p) continue;
    leaders.push({
      playerId: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      photoUrl: p.photoUrl,
      position: p.position,
      club: p.club,
      value: r.value,
    });
  }

  return NextResponse.json({ data: { statKey, scope, gameweekNumber, leaders } });
}
