export const dynamic = "force-dynamic";

// GET /api/stats/leaders?statKey=&scope=season|gameweek|average&seasonId=&gameweekNumber=
// Top 5 d'une ligne de stat détaillée (src/lib/stats/stat-lines.ts) : accumulée
// depuis le début de la saison, pour une seule journée (par défaut la dernière
// journée disposant de stats), ou en moyenne par match joué (average = season ÷
// nombre de matchs joués). seasonId cible indifféremment la saison active
// 2026/27 ou la saison Mode Simulation 2025/26 — Player/Club/Match/PlayerMatchStat
// sont partagés (ARCHITECTURE.md §5). Logique de calcul dans
// src/lib/stats/get-stat-leaders.ts, réutilisée par la génération d'image des posts
// Instagram automatiques (src/app/api/og/stat-leaders/route.tsx).
import { NextResponse } from "next/server";
import { z } from "zod";
import { STAT_LINE_KEYS } from "@/lib/stats/stat-lines";
import { COMPUTED_STAT_LINE_KEYS } from "@/lib/stats/computed-stat-lines";
import { getStatLeaders } from "@/lib/stats/get-stat-leaders";

const ALL_STAT_KEYS = [...STAT_LINE_KEYS, ...COMPUTED_STAT_LINE_KEYS] as [string, ...string[]];

const querySchema = z.object({
  statKey: z.enum(ALL_STAT_KEYS),
  scope: z.enum(["season", "gameweek", "average"]),
  seasonId: z.string().min(1),
  gameweekNumber: z.coerce.number().int().min(1).optional(),
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

  const result = await getStatLeaders(parsed.data);
  return NextResponse.json({ data: result });
}
