// Données enrichies du marché (/market) : valeur + tendance + points fantasy
// générés depuis le début de saison + rendement (points/M) + forme (5 dernières
// notes LNH). Endpoint dédié (/api/market) pour ne pas alourdir /api/players,
// utilisé par les wizards build/transferts où la latence compte.
//
// Anti-spoiler simulation : on ne lit que les journées `isScored` (le curseur
// admin les bascule, src/lib/simulation/admin-advance.ts) — jamais un
// PlayerMatchStat de journée à venir.
import { prisma } from "@/lib/db";
import { computeSeasonPlayerPoints } from "@/lib/players/compute-best-xi";
import { resolveModeSeason, type SeasonMode } from "@/lib/team/active-team-context";
import type { Position } from "@/lib/squad/validation";

const FORM_LENGTH = 5;

export interface MarketPlayer {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  marketValue: number;
  valueTrend: "up" | "down" | null;
  photoUrl: string | null;
  photoOffsetX: number;
  photoOffsetY: number;
  photoZoom: number;
  club: { id: string; shortName: string; name: string; logoUrl: string | null };
  seasonPoints: number;
  /** points fantasy / valeur marchande — rendement. 0 tant qu'aucune journée notée. */
  pointsPerMillion: number;
  /** jusqu'à 5 dernières notes LNH, ancienne → récente (pour lecture gauche→droite). */
  form: number[];
}

export async function getMarketPlayers(mode: SeasonMode): Promise<MarketPlayer[]> {
  const season = await resolveModeSeason(mode);
  if (!season) return [];

  const [players, seasonPoints] = await Promise.all([
    prisma.player.findMany({
      where: { seasonId: season.id, isActive: true },
      include: { club: { select: { id: true, name: true, shortName: true, logoUrl: true } } },
      orderBy: { marketValue: "desc" },
    }),
    computeSeasonPlayerPoints(season.id),
  ]);

  const playerIds = players.map((p) => p.id);

  const [history, formStats] = await Promise.all([
    prisma.playerValueHistory.findMany({
      where: { playerId: { in: playerIds } },
      orderBy: { changedAt: "desc" },
      select: { playerId: true, value: true },
    }),
    prisma.playerMatchStat.findMany({
      where: {
        playerId: { in: playerIds },
        lnhRating: { not: null },
        match: { seasonId: season.id, gameweek: { isScored: true } },
      },
      orderBy: { match: { gameweek: { number: "desc" } } },
      select: { playerId: true, lnhRating: true },
    }),
  ]);

  // Tendance de valeur : les 2 dernières entrées de PlayerValueHistory par joueur
  // (history est trié desc globalement → ordre relatif de chaque joueur préservé).
  const lastTwo = new Map<string, { latest: number; previous?: number }>();
  for (const h of history) {
    const e = lastTwo.get(h.playerId);
    if (!e) lastTwo.set(h.playerId, { latest: Number(h.value) });
    else if (e.previous === undefined) e.previous = Number(h.value);
  }
  const trendByPlayer = new Map<string, "up" | "down">();
  for (const [pid, { latest, previous }] of lastTwo) {
    if (previous === undefined || latest === previous) continue;
    trendByPlayer.set(pid, latest > previous ? "up" : "down");
  }

  // Forme : 5 notes les plus récentes par joueur (formStats trié par journée desc).
  const formByPlayer = new Map<string, number[]>();
  for (const s of formStats) {
    const arr = formByPlayer.get(s.playerId);
    if (arr) {
      if (arr.length < FORM_LENGTH) arr.push(Number(s.lnhRating));
    } else {
      formByPlayer.set(s.playerId, [Number(s.lnhRating)]);
    }
  }

  return players.map((p) => {
    const marketValue = Number(p.marketValue);
    const pts = Math.round((seasonPoints.get(p.id) ?? 0) * 10) / 10;
    return {
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      position: p.position as Position,
      marketValue,
      valueTrend: trendByPlayer.get(p.id) ?? null,
      photoUrl: p.photoUrl,
      photoOffsetX: p.photoOffsetX,
      photoOffsetY: p.photoOffsetY,
      photoZoom: Number(p.photoZoom),
      club: p.club,
      seasonPoints: pts,
      pointsPerMillion: marketValue > 0 ? Math.round((pts / marketValue) * 10) / 10 : 0,
      form: (formByPlayer.get(p.id) ?? []).slice().reverse(),
    };
  });
}
