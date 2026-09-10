// Résolution de l'état de confiance de toutes les journées d'une saison —
// couche data autour de getGameweekState (src/lib/gameweek/state.ts).
// Server-only (Prisma). Utilisé par les surfaces qui affichent un badge d'état
// (panneau /team, classement, historique, strips de matchs…).
import { prisma } from "@/lib/db";
import { getGameweekState, type GameweekStateResult } from "@/lib/gameweek/state";

export interface GameweekStatus extends GameweekStateResult {
  gameweekId: string;
  number: number;
  deadlineAt: Date;
  /** une correction LNH a déjà été appliquée sur cette journée (points recalculés). */
  hasCorrection: boolean;
  correctionAt: Date | null;
}

export async function getSeasonGameweekStatuses(
  seasonId: string,
  now: Date = new Date()
): Promise<Map<number, GameweekStatus>> {
  const [gameweeks, correctionBatches] = await Promise.all([
    prisma.gameweek.findMany({
      where: { seasonId },
      select: {
        id: true,
        number: true,
        deadlineAt: true,
        isScored: true,
        confirmedAt: true,
        matches: { select: { status: true } },
      },
      orderBy: { number: "asc" },
    }),
    prisma.lnhCorrectionBatch.findMany({
      select: { gameweekNumber: true, appliedAt: true },
      orderBy: { appliedAt: "desc" },
    }),
  ]);

  const latestCorrectionByGw = new Map<number, Date>();
  for (const b of correctionBatches) {
    if (!latestCorrectionByGw.has(b.gameweekNumber)) {
      latestCorrectionByGw.set(b.gameweekNumber, b.appliedAt);
    }
  }

  const out = new Map<number, GameweekStatus>();
  for (const gw of gameweeks) {
    const result = getGameweekState({
      deadlineAt: gw.deadlineAt,
      isScored: gw.isScored,
      confirmedAt: gw.confirmedAt,
      matchStatuses: gw.matches.map((m) => m.status),
      now,
    });
    out.set(gw.number, {
      ...result,
      gameweekId: gw.id,
      number: gw.number,
      deadlineAt: gw.deadlineAt,
      hasCorrection: latestCorrectionByGw.has(gw.number),
      correctionAt: latestCorrectionByGw.get(gw.number) ?? null,
    });
  }
  return out;
}

/**
 * Journée "en cours" du point de vue de l'utilisateur : la plus avancée dont la
 * deadline est passée (LIVE / AWAITING_RESULTS / PROVISIONAL / CONFIRMED). null en
 * pré-saison. C'est celle dont on affiche l'état sur /team et les classements.
 */
export async function getCurrentGameweekStatus(
  seasonId: string,
  now: Date = new Date()
): Promise<GameweekStatus | null> {
  const statuses = await getSeasonGameweekStatuses(seasonId, now);
  let current: GameweekStatus | null = null;
  for (const s of statuses.values()) {
    if (s.state === "UPCOMING") continue;
    if (!current || s.number > current.number) current = s;
  }
  return current;
}

/** État d'une seule journée (par id). */
export async function getGameweekStatus(
  gameweekId: string,
  now: Date = new Date()
): Promise<GameweekStatus | null> {
  const gw = await prisma.gameweek.findUnique({
    where: { id: gameweekId },
    select: {
      id: true,
      number: true,
      deadlineAt: true,
      isScored: true,
      confirmedAt: true,
      seasonId: true,
      matches: { select: { status: true } },
    },
  });
  if (!gw) return null;

  const latest = await prisma.lnhCorrectionBatch.findFirst({
    where: { gameweekNumber: gw.number },
    orderBy: { appliedAt: "desc" },
    select: { appliedAt: true },
  });

  const result = getGameweekState({
    deadlineAt: gw.deadlineAt,
    isScored: gw.isScored,
    confirmedAt: gw.confirmedAt,
    matchStatuses: gw.matches.map((m) => m.status),
    now,
  });
  return {
    ...result,
    gameweekId: gw.id,
    number: gw.number,
    deadlineAt: gw.deadlineAt,
    hasCorrection: latest != null,
    correctionAt: latest?.appliedAt ?? null,
  };
}
