// Analyse (lecture seule) des corrections que la LNH a publiées a posteriori sur
// une journée : re-scrape les boxscores lnh.fr et les compare aux PlayerMatchStat
// enregistrés. Alimente GET /api/admin/lnh-corrections et l'écran d'admin
// /admin/lnh-corrections.
import { prisma } from "@/lib/db";
import { scrapeGameweekBoxscoreRows } from "@/lib/ingestion/boxscore";
import { boxscoreRowToStatFields } from "@/lib/data-providers/lnh-scraper.provider";
import { LNH_LIVE_SEASONS_ID } from "./constants";
import {
  buildStatCorrections,
  correctionKey,
  CORRECTABLE_FIELDS,
  type StoredStatRow,
  type ScrapedStatRow,
  type FieldChange,
} from "./diff";

export interface CorrectionView {
  key: string;
  matchId: string;
  playerId: string;
  playerName: string;
  club: string;
  ratingChanged: boolean;
  ratingBefore: number | null;
  ratingAfter: number | null;
  changes: FieldChange[];
}

export interface MatchCorrections {
  matchId: string;
  label: string;
  corrections: CorrectionView[];
}

export interface AnalyzeResult {
  gameweekId: string;
  gameweekNumber: number;
  seasonLabel: string;
  isScored: boolean;
  matchesScraped: number;
  totalCorrections: number;
  ratingCorrections: number;
  matches: MatchCorrections[];
}

export async function analyzeGameweekCorrections(gameweekNumber: number): Promise<AnalyzeResult> {
  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) throw new Error("Aucune saison active");

  const gameweek = await prisma.gameweek.findUnique({
    where: { seasonId_number: { seasonId: season.id, number: gameweekNumber } },
    include: {
      matches: {
        include: {
          homeClub: { select: { shortName: true } },
          awayClub: { select: { shortName: true } },
        },
      },
    },
  });
  if (!gameweek) throw new Error(`Journée J${gameweekNumber} introuvable`);

  const matchLabelById = new Map(
    gameweek.matches.map((m) => [m.id, `${m.homeClub.shortName} – ${m.awayClub.shortName}`])
  );

  const scraped = await scrapeGameweekBoxscoreRows(gameweek.id, LNH_LIVE_SEASONS_ID);

  const storedStats = await prisma.playerMatchStat.findMany({
    where: { matchId: { in: gameweek.matches.map((m) => m.id) } },
  });

  const storedRows: StoredStatRow[] = storedStats.map((s) => {
    const rec = s as unknown as Record<string, unknown>;
    const fields: Record<string, unknown> = {};
    for (const f of CORRECTABLE_FIELDS) fields[f] = rec[f] ?? null;
    return { matchId: s.matchId, playerId: s.playerId, ...fields };
  });

  const scrapedRows: ScrapedStatRow[] = scraped.rows.map((r) => ({
    matchId: r.matchId,
    playerId: r.playerId,
    ...boxscoreRowToStatFields(r.row),
  }));

  const nameByKey = new Map(
    scraped.rows.map((r) => [
      correctionKey(r.matchId, r.playerId),
      { name: `${r.playerLastName} ${r.playerFirstName}`, club: r.clubShortName },
    ])
  );

  const corrections = buildStatCorrections(storedRows, scrapedRows);

  const byMatch = new Map<string, CorrectionView[]>();
  for (const c of corrections) {
    const meta = nameByKey.get(c.key) ?? { name: c.playerId, club: "?" };
    const view: CorrectionView = {
      key: c.key,
      matchId: c.matchId,
      playerId: c.playerId,
      playerName: meta.name,
      club: meta.club,
      ratingChanged: c.ratingChanged,
      ratingBefore: c.ratingBefore,
      ratingAfter: c.ratingAfter,
      changes: c.changes,
    };
    const arr = byMatch.get(c.matchId);
    if (arr) arr.push(view);
    else byMatch.set(c.matchId, [view]);
  }

  const matches: MatchCorrections[] = [...byMatch.entries()]
    .map(([matchId, list]) => ({
      matchId,
      label: matchLabelById.get(matchId) ?? matchId,
      corrections: list,
    }))
    .sort((a, b) => b.corrections.length - a.corrections.length);

  return {
    gameweekId: gameweek.id,
    gameweekNumber,
    seasonLabel: season.label,
    isScored: gameweek.isScored,
    matchesScraped: scraped.matchesProcessed,
    totalCorrections: corrections.length,
    ratingCorrections: corrections.filter((c) => c.ratingChanged).length,
    matches,
  };
}
