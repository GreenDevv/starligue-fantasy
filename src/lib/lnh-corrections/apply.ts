// Applique une sélection de corrections LNH sur une journée : upsert des
// PlayerMatchStat concernés, puis (si la journée est notée) rejoue le scoring
// complet de la journée (computeGameweekScores, rejouable — ARCHITECTURE.md §4.1)
// et construit le compte rendu par équipe (écart de points, écart de rang, joueurs
// concernés) qui sera relu par l'admin avant l'envoi des emails.
//
// Deux étapes voulues (décision produit) : cette fonction fait stats + recompute
// et RENVOIE le compte rendu ; l'envoi des emails est un appel séparé
// (send-emails.ts), déclenché par l'admin après relecture.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { scrapeGameweekBoxscoreRows } from "@/lib/ingestion/boxscore";
import { boxscoreRowToStatFields } from "@/lib/data-providers/lnh-scraper.provider";
import { computeGameweekScores } from "@/lib/scoring/compute";
import { generateWeeklyNews } from "@/lib/news/generate-weekly-news";
import { LNH_LIVE_SEASONS_ID } from "./constants";
import {
  buildStatCorrections,
  correctionKey,
  normalizeValue,
  CORRECTABLE_FIELDS,
  type StoredStatRow,
  type ScrapedStatRow,
  type FieldValue,
} from "./diff";
import {
  buildImpactRows,
  type ImpactRow,
  type AppliedCorrectionSummary,
  type TeamMeta,
  type TeamPointState,
} from "./report";

interface LineupEntryJson {
  playerId: string;
  role?: string;
}

export interface UndoEntry {
  matchId: string;
  playerId: string;
  /** Valeurs des champs corrigibles AVANT application — pour un éventuel retour arrière. */
  before: Record<string, FieldValue>;
}

export interface ApplyResult {
  gameweekId: string;
  gameweekNumber: number;
  isScored: boolean;
  recomputed: boolean;
  appliedCount: number;
  statsUpserted: number;
  correctionsApplied: AppliedCorrectionSummary[];
  impactRows: ImpactRow[];
  undo: UndoEntry[];
  /** Lot créé (LnhCorrectionBatch) si des équipes sont impactées — sinon null. */
  batchId: string | null;
  note?: string;
}

/** `report` d'un LnhCorrectionBatch — suffit pour notifier et pour revenir en arrière. */
export interface CorrectionBatchReport {
  gameweekNumber: number;
  correctionsApplied: AppliedCorrectionSummary[];
  impactRows: ImpactRow[];
  undo: UndoEntry[];
}

interface ResolvedSelection {
  gameweekId: string;
  gameweekNumber: number;
  seasonId: string;
  isScored: boolean;
  /** key → champs à écrire (issus du scrape le plus récent). */
  fieldsByKey: Map<string, ReturnType<typeof boxscoreRowToStatFields>>;
  /** key → valeurs stockées avant application (pour l'undo). */
  beforeByKey: Map<string, Record<string, FieldValue>>;
  appliedByPlayerId: Map<string, AppliedCorrectionSummary>;
}

async function resolveSelection(
  gameweekNumber: number,
  correctionKeys: string[]
): Promise<ResolvedSelection> {
  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) throw new Error("Aucune saison active");

  const gameweek = await prisma.gameweek.findUnique({
    where: { seasonId_number: { seasonId: season.id, number: gameweekNumber } },
    include: { matches: { select: { id: true } } },
  });
  if (!gameweek) throw new Error(`Journée J${gameweekNumber} introuvable`);

  const scraped = await scrapeGameweekBoxscoreRows(gameweek.id, LNH_LIVE_SEASONS_ID);
  const rowByKey = new Map(scraped.rows.map((r) => [correctionKey(r.matchId, r.playerId), r]));

  const storedStats = await prisma.playerMatchStat.findMany({
    where: { matchId: { in: gameweek.matches.map((m) => m.id) } },
  });
  const storedByKey = new Map<string, Record<string, FieldValue>>();
  const storedRows: StoredStatRow[] = storedStats.map((s) => {
    const rec = s as unknown as Record<string, unknown>;
    const norm: Record<string, FieldValue> = {};
    for (const f of CORRECTABLE_FIELDS) norm[f] = normalizeValue(rec[f]);
    storedByKey.set(correctionKey(s.matchId, s.playerId), norm);
    return { matchId: s.matchId, playerId: s.playerId, ...norm };
  });

  const scrapedRows: ScrapedStatRow[] = scraped.rows.map((r) => ({
    matchId: r.matchId,
    playerId: r.playerId,
    ...boxscoreRowToStatFields(r.row),
  }));

  const wanted = new Set(correctionKeys);
  const corrections = buildStatCorrections(storedRows, scrapedRows).filter((c) => wanted.has(c.key));

  const fieldsByKey = new Map<string, ReturnType<typeof boxscoreRowToStatFields>>();
  const beforeByKey = new Map<string, Record<string, FieldValue>>();
  const appliedByPlayerId = new Map<string, AppliedCorrectionSummary>();

  for (const c of corrections) {
    const scrapedRow = rowByKey.get(c.key);
    if (!scrapedRow) continue; // la correction ne peut venir que d'une ligne scrapée
    fieldsByKey.set(c.key, boxscoreRowToStatFields(scrapedRow.row));
    beforeByKey.set(c.key, storedByKey.get(c.key) ?? {});
    appliedByPlayerId.set(c.playerId, {
      playerId: c.playerId,
      playerName: `${scrapedRow.playerLastName} ${scrapedRow.playerFirstName}`,
      club: scrapedRow.clubShortName,
      ratingBefore: c.ratingBefore,
      ratingAfter: c.ratingAfter,
      ratingChanged: c.ratingChanged,
      otherFieldCount: c.changes.filter((ch) => ch.field !== "lnhRating").length,
    });
  }

  return {
    gameweekId: gameweek.id,
    gameweekNumber,
    seasonId: season.id,
    isScored: gameweek.isScored,
    fieldsByKey,
    beforeByKey,
    appliedByPlayerId,
  };
}

interface TeamGwSnapshot {
  meta: TeamMeta;
  fieldedPlayerIds: Set<string>;
  points: number;
}

async function gatherTeamGwState(
  gameweekId: string,
  seasonId: string,
  gameweekNumber: number
): Promise<{
  teams: TeamMeta[];
  fieldedPlayerIdsByTeam: Map<string, Set<string>>;
  state: Map<string, TeamPointState>;
}> {
  const lineups = await prisma.fantasyLineup.findMany({
    where: { gameweekId, isCatchup: false },
    select: {
      points: true,
      entries: true,
      fantasyTeam: {
        select: {
          id: true,
          name: true,
          user: { select: { id: true, email: true } },
          league: { select: { name: true } },
        },
      },
    },
  });

  const snapshots = await prisma.fantasyStandingSnapshot.findMany({
    where: { seasonId, mode: "LIVE", gameweekNumber },
    select: { teamId: true, globalRank: true, leagueRank: true },
  });
  const rankByTeam = new Map(snapshots.map((s) => [s.teamId, s]));

  const teams: TeamMeta[] = [];
  const fieldedPlayerIdsByTeam = new Map<string, Set<string>>();
  const state = new Map<string, TeamPointState>();

  for (const l of lineups) {
    const t = l.fantasyTeam;
    teams.push({
      teamId: t.id,
      userId: t.user.id,
      email: t.user.email,
      teamName: t.name,
      leagueName: t.league.name,
    });
    const entries = (l.entries as unknown as LineupEntryJson[]) ?? [];
    fieldedPlayerIdsByTeam.set(t.id, new Set(entries.map((e) => e.playerId)));
    const rank = rankByTeam.get(t.id);
    state.set(t.id, {
      points: Number(l.points ?? 0),
      globalRank: rank?.globalRank ?? null,
      leagueRank: rank?.leagueRank ?? null,
    });
  }

  return { teams, fieldedPlayerIdsByTeam, state };
}

export async function applyGameweekCorrections(
  gameweekNumber: number,
  correctionKeys: string[],
  opts: { appliedBy: string }
): Promise<ApplyResult> {
  const sel = await resolveSelection(gameweekNumber, correctionKeys);
  const keys = [...sel.fieldsByKey.keys()];

  const correctionsApplied = [...sel.appliedByPlayerId.values()];
  const undo: UndoEntry[] = keys.map((key) => {
    const [matchId, playerId] = key.split(":");
    return { matchId: matchId!, playerId: playerId!, before: sel.beforeByKey.get(key) ?? {} };
  });

  if (keys.length === 0) {
    return {
      gameweekId: sel.gameweekId,
      gameweekNumber,
      isScored: sel.isScored,
      recomputed: false,
      appliedCount: 0,
      statsUpserted: 0,
      correctionsApplied: [],
      impactRows: [],
      undo: [],
      batchId: null,
      note: "Aucune correction sélectionnée ne correspond à un écart réel — rien appliqué.",
    };
  }

  // "Avant" — capturé seulement pour une journée notée (sinon pas de points/rangs).
  const before = sel.isScored
    ? await gatherTeamGwState(sel.gameweekId, sel.seasonId, sel.gameweekNumber)
    : null;

  // Upsert des stats corrigées (transaction).
  await prisma.$transaction(
    keys.map((key) => {
      const [matchId, playerId] = key.split(":");
      const fields = sel.fieldsByKey.get(key)!;
      return prisma.playerMatchStat.upsert({
        where: { matchId_playerId: { matchId: matchId!, playerId: playerId! } },
        create: { matchId: matchId!, playerId: playerId!, ...fields },
        update: fields,
      });
    })
  );

  if (!sel.isScored) {
    return {
      gameweekId: sel.gameweekId,
      gameweekNumber,
      isScored: false,
      recomputed: false,
      appliedCount: keys.length,
      statsUpserted: keys.length,
      correctionsApplied,
      impactRows: [],
      undo,
      batchId: null,
      note: "Journée non notée : stats corrigées, les points seront calculés lors du scoring normal de la journée.",
    };
  }

  // Rejoue le scoring de la journée (rejouable) + régénère les actus dérivées.
  await computeGameweekScores(sel.gameweekId);
  try {
    await generateWeeklyNews(sel.seasonId, sel.gameweekId, sel.gameweekNumber);
  } catch (e) {
    console.error("[lnh-corrections][weekly-news]", e);
  }

  const after = await gatherTeamGwState(sel.gameweekId, sel.seasonId, sel.gameweekNumber);

  const impactRows = buildImpactRows({
    teams: after.teams,
    before: before!.state,
    after: after.state,
    appliedByPlayerId: sel.appliedByPlayerId,
    fieldedPlayerIdsByTeam: after.fieldedPlayerIdsByTeam,
  });

  // Trace le lot uniquement s'il y a des managers à prévenir — sinon rien à
  // notifier, pas besoin d'une entrée en attente.
  let batchId: string | null = null;
  if (impactRows.length > 0) {
    const report: CorrectionBatchReport = { gameweekNumber, correctionsApplied, impactRows, undo };
    const batch = await prisma.lnhCorrectionBatch.create({
      data: {
        gameweekNumber,
        appliedBy: opts.appliedBy,
        correctionCount: keys.length,
        report: report as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    batchId = batch.id;
  }

  return {
    gameweekId: sel.gameweekId,
    gameweekNumber,
    isScored: true,
    recomputed: true,
    appliedCount: keys.length,
    statsUpserted: keys.length,
    correctionsApplied,
    impactRows,
    undo,
    batchId,
  };
}

/**
 * Retour arrière : ré-écrit les valeurs des champs corrigibles telles qu'elles
 * étaient avant l'application (payload `undo` renvoyé par applyGameweekCorrections),
 * puis rejoue le scoring. Ne recrée pas une stat qui n'existait pas avant (cas
 * marginal d'une ligne scrapée sans PlayerMatchStat).
 */
export async function revertGameweekCorrections(
  gameweekNumber: number,
  entries: UndoEntry[]
): Promise<{ reverted: number; recomputed: boolean }> {
  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) throw new Error("Aucune saison active");
  const gameweek = await prisma.gameweek.findUnique({
    where: { seasonId_number: { seasonId: season.id, number: gameweekNumber } },
    select: { id: true, isScored: true },
  });
  if (!gameweek) throw new Error(`Journée J${gameweekNumber} introuvable`);

  const restorable = entries.filter((e) => Object.keys(e.before).length > 0);

  await prisma.$transaction(
    restorable.map((e) => {
      const data: Record<string, FieldValue> = {};
      for (const f of CORRECTABLE_FIELDS) data[f] = e.before[f] ?? null;
      return prisma.playerMatchStat.updateMany({
        where: { matchId: e.matchId, playerId: e.playerId },
        data,
      });
    })
  );

  if (gameweek.isScored) {
    await computeGameweekScores(gameweek.id);
    try {
      await generateWeeklyNews(season.id, gameweek.id, gameweekNumber);
    } catch (e) {
      console.error("[lnh-corrections][revert][weekly-news]", e);
    }
  }

  return { reverted: restorable.length, recomputed: gameweek.isScored };
}
