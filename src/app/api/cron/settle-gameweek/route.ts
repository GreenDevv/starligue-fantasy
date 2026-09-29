export const dynamic = "force-dynamic";

// POST /api/cron/settle-gameweek — pipeline automatique de clôture de journée.
//
// Pour chaque journée dont la deadline est passée et qui n'est pas encore
// confirmée, enchaîne (tout idempotent, rejouable) :
//   1. sync calendrier (lnh.fr ou LFH)  → Match.status / scores / horaires
//   2. snapshot des alignements  (dès la deadline passée)
//   3. si tous les matchs sont réglés → stats + notes de la journée
//   4. si tous les matchs ont leurs notes → calcul des points (+ actus /starligue)
//   5. classement officiel de la dernière journée finie
//   6. (LFH seulement) passage au 🟢 des journées notées, fenêtre de correction passée
//
// Étapes 1, 3 et 5 aiguillées selon la compétition servie (LNH ou LFH,
// src/lib/ingestion/competition.ts, ARCHITECTURE.md §35) ; le reste est commun.
//
// Côté LNH, NE POSE JAMAIS confirmedAt : le passage au 🟢 est décidé par le cron
// corrections LNH du mardi (src/app/api/cron/lnh-corrections), une fois les notes
// relues. Côté LFH (pas de cron corrections), c'est l'étape 6.
//
// Remplace la séquence manuelle documentée dans la mémoire
// gameweek_close_and_matchday_pack. Les routes sync-ratings / snapshot-lineups /
// compute-scores restent utilisables à la main comme filet.
//
// Planifié par .github/workflows/cron-settle.yml (créneaux de match + rattrapages).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron-auth";
import { IngestionError } from "@/lib/data-providers/lnh-scraper.provider";
import { getCompetitionIngestion } from "@/lib/ingestion/competition";
import { snapshotGameweekLineups } from "@/lib/scoring/snapshot-lineups";
import { computeGameweekScores } from "@/lib/scoring/compute";
import { generateWeeklyNews } from "@/lib/news/generate-weekly-news";

const SETTLED_STATUSES = new Set(["FINISHED", "POSTPONED", "CANCELLED"]);

interface GameweekReport {
  number: number;
  reachedState: "snapshotted" | "boxscore" | "scored";
  snapshotted?: number;
  statsUpserted?: number;
  lineupCount?: number;
  error?: string;
}

export async function POST(request: Request) {
  if (!(await verifyCronAuth(request))) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    return NextResponse.json({ error: { code: "NO_SEASON" } }, { status: 400 });
  }

  const now = new Date();
  const pending = await prisma.gameweek.findMany({
    where: { seasonId: season.id, deadlineAt: { lte: now }, confirmedAt: null },
    orderBy: { number: "asc" },
    select: { id: true, number: true, isScored: true },
  });

  if (pending.length === 0) {
    return NextResponse.json({ data: { settled: [], errors: [] } });
  }

  const errors: string[] = [];
  const ingestion = getCompetitionIngestion();

  // 1. Calendrier (un seul fetch pour toute la saison) — met à jour Match.status.
  try {
    await ingestion.syncSeasonCalendar(season.id);
  } catch (err) {
    const recoverable = err instanceof IngestionError ? err.recoverable : false;
    console.warn("[settle-gameweek] calendars:", String(err));
    errors.push(`calendars: ${String(err)}`);
    if (!recoverable) {
      return NextResponse.json({ error: { code: "SCRAPER_ERROR", message: String(err) } }, { status: 502 });
    }
  }

  const reports: GameweekReport[] = [];

  for (const gw of pending) {
    const report: GameweekReport = { number: gw.number, reachedState: "snapshotted" };
    try {
      // 2. Snapshot des alignements (idempotent, garde-fou validatedAt inclus).
      const snap = await snapshotGameweekLineups({ gameweekIds: [gw.id], now });
      report.snapshotted = snap.snapshotted;

      const matches = await prisma.match.findMany({
        where: { gameweekId: gw.id },
        select: { status: true, _count: { select: { playerStats: { where: { isLive: false } } } } },
      });
      const allSettled = matches.length > 0 && matches.every((m) => SETTLED_STATUSES.has(m.status));
      const allHaveStats = matches.length > 0 && matches.every((m) => m._count.playerStats > 0);

      // 3. Stats + notes de la journée, une fois tous les matchs réglés.
      if (allSettled && !allHaveStats) {
        try {
          const box = await ingestion.syncGameweekStats(gw.id);
          report.statsUpserted = box.statsUpserted;
          report.reachedState = "boxscore";
        } catch (err) {
          const recoverable = err instanceof IngestionError ? err.recoverable : false;
          console.warn(`[settle-gameweek] boxscore J${gw.number}:`, String(err));
          report.error = `boxscore: ${String(err)}`;
          if (!recoverable) throw err;
        }
      }

      // 4. Calcul des points quand toutes les notes sont là.
      const statsNow = await prisma.match.findMany({
        where: { gameweekId: gw.id },
        select: { _count: { select: { playerStats: { where: { isLive: false } } } } },
      });
      const readyToScore =
        statsNow.length > 0 && statsNow.every((m) => m._count.playerStats > 0) && !gw.isScored;

      if (readyToScore) {
        const { lineupCount } = await computeGameweekScores(gw.id);
        report.lineupCount = lineupCount;
        report.reachedState = "scored";
        try {
          await generateWeeklyNews(season.id, gw.id, gw.number);
        } catch (newsErr) {
          console.error("[settle-gameweek][weekly-news]", newsErr);
        }
      }
    } catch (err) {
      report.error = String(err);
      errors.push(`J${gw.number}: ${String(err)}`);
    }
    reports.push(report);
  }

  // 5. Classement officiel de la dernière journée finie.
  const lastFinished = await prisma.gameweek.findFirst({
    where: { seasonId: season.id, matches: { some: { status: "FINISHED" } } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  try {
    await ingestion.syncStandings(season.id, lastFinished?.number ?? 0);
  } catch (err) {
    console.warn("[settle-gameweek] standings:", String(err));
    errors.push(`standings: ${String(err)}`);
  }

  // 6. Confirmation (LFH seulement, voir confirmGameweeks).
  if (ingestion.confirmGameweeks) {
    try {
      await ingestion.confirmGameweeks(season.id);
    } catch (err) {
      console.warn("[settle-gameweek] confirm:", String(err));
      errors.push(`confirm: ${String(err)}`);
    }
  }

  return NextResponse.json({ data: { settled: reports, errors } });
}
