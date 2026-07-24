// Leaders de la dernière journée notée, pour la page publique /starligue —
// délibérément séparé de src/lib/scoring/stat-leaders.ts (qui pilote le bonus/malus
// de scoring fantasy à partir de STAT_LINES) : ceci est un affichage éditorial pur,
// ne doit jamais influencer les règles du jeu. "saves" (arrêts gardien) n'est dans
// aucun des deux registres existants (STAT_LINES/COMPUTED_STAT_LINES, src/lib/stats/stat-lines.ts)
// donc géré ici en propre plutôt que d'être ajouté à un registre lié au scoring.
import { prisma } from "@/lib/db";
import type { Position } from "@/lib/squad/validation";

export interface WeeklyLeaderEntry {
  playerId: string;
  firstName: string;
  lastName: string;
  position: Position;
  photoUrl: string | null;
  club: { shortName: string; logoUrl: string | null };
  value: number;
}

export interface WeeklyLeaderCategory {
  key: "goalsTotal" | "assists" | "saves" | "opponentShotsBlocked";
  label: string;
  leaders: WeeklyLeaderEntry[];
}

export interface WeeklyLeadersResult {
  gameweekNumber: number | null;
  categories: WeeklyLeaderCategory[];
}

const CATEGORIES: { key: WeeklyLeaderCategory["key"]; label: string }[] = [
  { key: "goalsTotal", label: "Buteurs" },
  { key: "assists", label: "Passeurs" },
  { key: "saves", label: "Arrêts" },
  { key: "opponentShotsBlocked", label: "Contres" },
];

const LIMIT = 3;

export async function getWeeklyStatLeaders(seasonId: string): Promise<WeeklyLeadersResult> {
  const gameweek = await prisma.gameweek.findFirst({
    where: { seasonId, matches: { some: { playerStats: { some: {} } } } },
    orderBy: { number: "desc" },
    select: { id: true, number: true },
  });
  if (!gameweek) return { gameweekNumber: null, categories: [] };

  const matchWhere = { gameweekId: gameweek.id };

  const categories: WeeklyLeaderCategory[] = [];
  for (const { key, label } of CATEGORIES) {
    // Cast en `unknown` puis en forme minimale : même contournement que
    // GET /api/stats/leaders (le typage généré par Prisma ne permet pas d'indexer
    // _sum par une clé variable, "needs to be provided in by").
    const groupByArgs = { by: ["playerId"], where: { match: matchWhere }, _sum: { [key]: true } };
    const grouped = (await (prisma.playerMatchStat.groupBy as (args: unknown) => Promise<unknown>)(
      groupByArgs
    )) as Array<{ playerId: string; _sum: Record<string, number | null> }>;

    const ranked: { playerId: string; value: number }[] = grouped
      .map((g) => ({ playerId: g.playerId, value: g._sum[key] ?? null }))
      .filter((r): r is { playerId: string; value: number } => r.value !== null && r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, LIMIT);

    if (ranked.length === 0) {
      categories.push({ key, label, leaders: [] });
      continue;
    }

    const players = await prisma.player.findMany({
      where: { id: { in: ranked.map((r) => r.playerId) } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        position: true,
        photoUrl: true,
        club: { select: { shortName: true, logoUrl: true } },
      },
    });
    const playerById = new Map(players.map((p) => [p.id, p]));

    const leaders: WeeklyLeaderEntry[] = [];
    for (const r of ranked) {
      const p = playerById.get(r.playerId);
      if (!p) continue;
      leaders.push({
        playerId: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position as Position,
        photoUrl: p.photoUrl,
        club: p.club,
        value: r.value,
      });
    }
    categories.push({ key, label, leaders });
  }

  return { gameweekNumber: gameweek.number, categories };
}
