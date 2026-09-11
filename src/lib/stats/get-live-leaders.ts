// Leaders EN DIRECT (buteurs, gardiens) calculés depuis MatchLiveEvent pour les
// matchs actuellement LIVE — distinct de get-weekly-leaders.ts (leaders de la
// dernière journée NOTÉE, sourcés du boxscore post-match PlayerMatchStat, qui ne se
// met à jour qu'après le coup de sifflet final via sync-ratings). Se vide tout seul
// dès qu'aucun match n'est en cours (catégories omises si aucun leader).
//
// ⚠️ Pas de "passeurs" ici : le feed live lnh.fr (/ajaxlive, voir
// lnh-scraper.provider.ts) ne trace aucun événement de passe décisive, seulement
// buts/arrêts/cartons/pertes de balle — contrairement au boxscore post-match qui,
// lui, a un champ assists. Uniquement calculable une fois le match terminé.
import { prisma } from "@/lib/db";
import type { Position } from "@/lib/squad/validation";

export interface LiveLeaderEntry {
  playerId: string;
  firstName: string;
  lastName: string;
  position: Position;
  photoUrl: string | null;
  club: { shortName: string; logoUrl: string | null };
  value: number;
}

export interface LiveLeaderCategory {
  key: "goals" | "saves";
  label: string;
  leaders: LiveLeaderEntry[];
}

const LIMIT = 5;
const GOAL_ICONS = new Set(["goals", "goals_7m"]);
const SAVE_ICONS = new Set(["stops"]);

interface Accumulator {
  info: Omit<LiveLeaderEntry, "value">;
  count: number;
}

function topEntries(map: Map<string, Accumulator>): LiveLeaderEntry[] {
  return [...map.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, LIMIT)
    .map((a) => ({ ...a.info, value: a.count }));
}

export async function getLiveStatLeaders(seasonId: string): Promise<LiveLeaderCategory[]> {
  const rows = await prisma.matchLiveEvent.findMany({
    where: { playerId: { not: null }, match: { seasonId, status: "LIVE" } },
    select: {
      icon: true,
      playerId: true,
      player: {
        select: {
          firstName: true,
          lastName: true,
          position: true,
          photoUrl: true,
          club: { select: { shortName: true, logoUrl: true } },
        },
      },
    },
  });

  const goals = new Map<string, Accumulator>();
  const saves = new Map<string, Accumulator>();

  for (const row of rows) {
    if (!row.playerId || !row.player) continue;
    const isGoal = GOAL_ICONS.has(row.icon);
    const isSave = SAVE_ICONS.has(row.icon);
    if (!isGoal && !isSave) continue;

    const map = isGoal ? goals : saves;
    const existing = map.get(row.playerId);
    if (existing) {
      existing.count++;
    } else {
      map.set(row.playerId, {
        count: 1,
        info: { playerId: row.playerId, ...row.player },
      });
    }
  }

  const categories: LiveLeaderCategory[] = [
    { key: "goals", label: "Buteurs", leaders: topEntries(goals) },
    { key: "saves", label: "Arrêts", leaders: topEntries(saves) },
  ];
  return categories.filter((c) => c.leaders.length > 0);
}
