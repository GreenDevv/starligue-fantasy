// Ingestion Ligue Butagaz Énergie (jeu féminin) — ARCHITECTURE.md §35.4 (lot 2).
//
// Pendant LFH de src/lib/ingestion/boxscore.ts + src/lib/standings/live-sync.ts :
// mise en place de la saison, synchro du calendrier, stats + note calculée de
// chaque journée, classement officiel, valorisation initiale. Idempotent partout
// (identité par externalIds, jamais de create nu sur une ligne déjà connue) :
// relancer une étape ne duplique rien. La logique de décision est dans
// lfh-season-plan.ts (pur, testé) ; ce fichier ne fait que lire/écrire.

import { prisma } from "@/lib/db";
import type { Position, Prisma } from "@prisma/client";
import {
  createLfhProvider,
  mergeLfhMatchStats,
  type VisionSportSheet,
} from "@/lib/data-providers/lfh.provider";
import { IngestionError } from "@/lib/data-providers/lnh-scraper.provider";
import {
  planLfhSeason,
  lfhClubSlug,
  resolveLfhPlayer,
  isLfhGameweekReadyToConfirm,
  type LfhKnownPlayer,
} from "./lfh-season-plan";
import { recomputeGameweekDeadlines } from "./boxscore";
import { computeMatchRating, parseComputedRatingWeights } from "@/lib/scoring/computed-rating";
import { snapshotClubStandings } from "@/lib/standings/snapshot";
import { computeGameweekScores } from "@/lib/scoring/compute";
import { standingsFitGameweek } from "@/lib/standings/live-sync";
import {
  valueNewcomersFromSeasonScores,
  DEFAULT_NEWCOMER_VALUATION_CONFIG,
  type NewcomerValuationConfig,
} from "@/lib/players/valuation";

/** Poule LFH de la saison servie (LBE 2026-2027 = 98). Surchargeable par env pour la saison suivante. */
export function getLfhPouleId(): string {
  return process.env.LFH_POULE_ID?.trim() || "98";
}

type Ext = Record<string, string | number | boolean | undefined>;
const ext = (v: unknown): Ext => (v && typeof v === "object" ? (v as Ext) : {});

async function loadGameConfig(): Promise<Record<string, string>> {
  const rows = await prisma.gameConfig.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// ─────────────────────────── Mise en place ───────────────────────────

export interface LfhSetupResult {
  seasonId: string;
  clubs: number;
  gameweeks: number;
  matches: number;
  matchesWithoutDate: number;
  players: number;
  playersSkippedNoPosition: string[];
}

/**
 * Crée ou met à jour saison, clubs, journées, matchs et joueuses depuis l'API LFH.
 * Rejouable : clubs retrouvés par slug de fiche club, matchs par id de rencontre,
 * joueuses par id WordPress (puis nom dans le club). Une joueuse créée ici n'a pas
 * encore de valeur (valuationPending) : voir valueLfhPlayersFromSeasonStats.
 * N'écrase jamais la deadline d'une journée déjà notée.
 */
export async function setupLfhSeason(seasonLabel: string): Promise<LfhSetupResult> {
  const provider = createLfhProvider();
  const pouleId = getLfhPouleId();
  const [fixtures, journees] = await Promise.all([
    provider.fetchSeasonFixtures(pouleId),
    provider.fetchPouleJournees(pouleId),
  ]);
  const plan = planLfhSeason(fixtures, journees);

  const season = await prisma.season.upsert({
    where: { label: seasonLabel },
    update: { isActive: true },
    create: { label: seasonLabel, isActive: true },
  });
  await prisma.season.updateMany({ where: { id: { not: season.id } }, data: { isActive: false } });

  // Clubs (Club n'a pas de contrainte unique : recherche par slug LFH en mémoire).
  const existingClubs = await prisma.club.findMany();
  const clubIdByTeamId = new Map<string, string>();
  for (const c of plan.clubs) {
    const found = existingClubs.find((e) => ext(e.externalIds).lfh_club === c.slug);
    const data = {
      name: c.name,
      shortName: c.shortName,
      displayName: c.displayName,
      logoUrl: c.logoUrl,
      externalIds: { ...ext(found?.externalIds), lfh_club: c.slug, lfh_team_id: c.lfhTeamId },
    };
    const club = found
      ? await prisma.club.update({ where: { id: found.id }, data })
      : await prisma.club.create({ data });
    clubIdByTeamId.set(c.lfhTeamId, club.id);
  }

  // Journées + matchs.
  const existingMatches = await prisma.match.findMany({ where: { seasonId: season.id } });
  const matchByRencontre = new Map(existingMatches.map((m) => [String(ext(m.externalIds).lfh_rencontre_id), m]));
  let matchCount = 0;
  let matchesWithoutDate = 0;
  for (const gw of plan.gameweeks) {
    const existingGw = await prisma.gameweek.findUnique({
      where: { seasonId_number: { seasonId: season.id, number: gw.number } },
    });
    const gameweek = existingGw
      ? existingGw.isScored
        ? existingGw
        : await prisma.gameweek.update({ where: { id: existingGw.id }, data: { deadlineAt: gw.deadlineAt } })
      : await prisma.gameweek.create({ data: { seasonId: season.id, number: gw.number, deadlineAt: gw.deadlineAt } });

    for (const m of gw.matches) {
      const data = {
        seasonId: season.id,
        gameweekId: gameweek.id,
        homeClubId: clubIdByTeamId.get(m.homeTeamId)!,
        awayClubId: clubIdByTeamId.get(m.awayTeamId)!,
        kickoffAt: m.kickoffAt,
        status: m.status,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        externalIds: {
          lfh_rencontre_id: m.rencontreId,
          lfh_ext_rencontre_id: m.extRencontreId,
          ...(m.kickoffTbd ? { lfh_kickoff_tbd: true } : {}),
        },
      };
      const found = matchByRencontre.get(m.rencontreId);
      if (found) await prisma.match.update({ where: { id: found.id }, data });
      else await prisma.match.create({ data });
      matchCount++;
      if (m.kickoffTbd) matchesWithoutDate++;
    }
  }

  const roster = await syncLfhRoster(season.id);

  return {
    seasonId: season.id,
    clubs: plan.clubs.length,
    gameweeks: plan.gameweeks.length,
    matches: matchCount,
    matchesWithoutDate,
    players: roster.created + roster.updated,
    playersSkippedNoPosition: roster.skippedNoPosition,
  };
}

// ─────────────────────────── Effectif ───────────────────────────

export interface LfhRosterSyncResult {
  created: number;
  updated: number;
  skippedNoPosition: string[];
}

/**
 * Crée ou met à jour les joueuses de la poule (toutes celles déjà inscrites sur une
 * feuille de match). Identité : id WordPress, puis identifiant fédéral, puis nom +
 * prénom dans le club. Une joueuse créée démarre à la valeur plancher avec
 * valuationPending (voir valueLfhPlayersFromSeasonStats). Une joueuse sans fiche
 * WordPress n'a pas de poste connu : signalée, pas créée (injouable en fantasy).
 */
export async function syncLfhRoster(seasonId: string): Promise<LfhRosterSyncResult> {
  const scraped = await createLfhProvider().fetchPouleRoster(getLfhPouleId());
  const clubs = await prisma.club.findMany({ select: { id: true, externalIds: true } });
  const clubIdBySlug = new Map(clubs.map((c) => [String(ext(c.externalIds).lfh_club), c.id]));
  const placeholderValue = parseLfhValuationConfig(await loadGameConfig()).minValue;

  const players = await prisma.player.findMany({ where: { seasonId } });
  const known = (): LfhKnownPlayer[] =>
    players.map((p) => ({
      playerId: p.id,
      clubId: p.clubId,
      firstName: p.firstName,
      lastName: p.lastName,
      wpPlayerId: ext(p.externalIds).lfh_wp_id !== undefined ? Number(ext(p.externalIds).lfh_wp_id) : null,
      individuId: ext(p.externalIds).lfh_individu_id !== undefined ? String(ext(p.externalIds).lfh_individu_id) : null,
    }));

  const result: LfhRosterSyncResult = { created: 0, updated: 0, skippedNoPosition: [] };
  for (const s of scraped) {
    const clubId = clubIdBySlug.get(lfhClubSlug(s.clubPageUrl) ?? "");
    if (!clubId) continue; // club hors poule (ne devrait pas arriver : effectif filtré par poule)
    if (!s.position) {
      result.skippedNoPosition.push(`${s.firstName} ${s.lastName} (${s.clubName})`);
      continue;
    }
    const match = resolveLfhPlayer(known(), s, clubId);
    const found = match ? players.find((p) => p.id === match.playerId)! : null;
    const identity = {
      clubId,
      firstName: s.firstName,
      lastName: s.lastName,
      position: s.position,
      photoUrl: s.photoUrl,
      externalIds: {
        ...ext(found?.externalIds),
        lfh_individu_id: s.individuId,
        ...(s.wpPlayerId !== null ? { lfh_wp_id: s.wpPlayerId } : {}),
      },
    };
    if (found) {
      const updated = await prisma.player.update({ where: { id: found.id }, data: identity });
      players[players.indexOf(found)] = updated;
      result.updated++;
    } else {
      const created = await prisma.player.create({
        data: { ...identity, seasonId, marketValue: placeholderValue, valuationPending: true },
      });
      players.push(created);
      result.created++;
    }
  }
  return result;
}

// ─────────────────────────── Calendrier ───────────────────────────

export interface LfhCalendarSyncResult {
  resultsUpdated: number;
  scheduleUpdated: number;
  deadlinesUpdated: number;
  unknownRencontres: number;
}

/**
 * Met à jour statut, score et horaire des matchs déjà en base depuis le calendrier
 * LFH (un seul fetch pour la saison), puis la deadline des journées dont un horaire
 * a bougé (même règle que côté LNH : recomputeGameweekDeadlines).
 */
export async function syncLfhSeasonCalendar(seasonId: string): Promise<LfhCalendarSyncResult> {
  const fixtures = await createLfhProvider().fetchSeasonFixtures(getLfhPouleId());
  const matches = await prisma.match.findMany({ where: { seasonId } });
  const byRencontre = new Map(matches.map((m) => [String(ext(m.externalIds).lfh_rencontre_id), m]));

  let resultsUpdated = 0;
  let scheduleUpdated = 0;
  let unknownRencontres = 0;
  const gameweeksWithScheduleChange = new Set<string>();

  for (const f of fixtures) {
    const match = byRencontre.get(f.rencontreId);
    if (!match) {
      unknownRencontres++;
      continue;
    }
    const ids = ext(match.externalIds);
    const resultChanged =
      match.status !== f.status || match.homeScore !== f.homeScore || match.awayScore !== f.awayScore;
    // Horaire publié (ou modifié) : remplace la date de repli d'un match « à confirmer ».
    const scheduleChanged = f.kickoffAt !== null && f.kickoffAt.getTime() !== match.kickoffAt.getTime();
    const tbdCleared = f.kickoffAt !== null && ids.lfh_kickoff_tbd === true;
    if (!resultChanged && !scheduleChanged && !tbdCleared) continue;

    const { lfh_kickoff_tbd: _tbd, ...idsWithoutTbd } = ids;
    await prisma.match.update({
      where: { id: match.id },
      data: {
        ...(resultChanged ? { status: f.status, homeScore: f.homeScore, awayScore: f.awayScore } : {}),
        ...(scheduleChanged ? { kickoffAt: f.kickoffAt! } : {}),
        ...(tbdCleared ? { externalIds: idsWithoutTbd } : {}),
      },
    });
    if (resultChanged) resultsUpdated++;
    if (scheduleChanged) {
      scheduleUpdated++;
      gameweeksWithScheduleChange.add(match.gameweekId);
    }
  }

  const deadlinesUpdated = await recomputeGameweekDeadlines(gameweeksWithScheduleChange);
  return { resultsUpdated, scheduleUpdated, deadlinesUpdated, unknownRencontres };
}

// ─────────────────────────── Stats + note ───────────────────────────

export interface LfhGameweekStatsResult {
  gameweekNumber: number;
  matchesProcessed: number;
  statsUpserted: number;
  /** Lignes de feuille sans joueuse en base (nouvelle recrue : lancer la mise en place). */
  unresolved: string[];
  /** Matchs sans feuille vision-sport : tirs et arrêts inconnus, gardiennes mal notées. */
  missingSheets: string[];
}

/**
 * Stats de tous les matchs TERMINÉS d'une journée : feuille officielle LFH +
 * feuille vision-sport, fusionnées, note calculée (computed-rating.ts, poids
 * GameConfig), upsert PlayerMatchStat. Une feuille vision-sport illisible n'arrête
 * pas la journée : le match est noté sur la feuille officielle seule et signalé.
 */
export async function syncLfhGameweekStats(
  gameweekId: string,
  opts: { rosterRefreshed?: boolean } = {}
): Promise<LfhGameweekStatsResult> {
  const provider = createLfhProvider();
  const gameweek = await prisma.gameweek.findUniqueOrThrow({
    where: { id: gameweekId },
    include: { matches: true },
  });
  const weights = parseComputedRatingWeights(await loadGameConfig());
  const players = await prisma.player.findMany({
    where: { seasonId: gameweek.seasonId },
    select: { id: true, clubId: true, firstName: true, lastName: true, position: true, externalIds: true },
  });
  const known: LfhKnownPlayer[] = players.map((p) => ({
    playerId: p.id,
    clubId: p.clubId,
    firstName: p.firstName,
    lastName: p.lastName,
    wpPlayerId: ext(p.externalIds).lfh_wp_id !== undefined ? Number(ext(p.externalIds).lfh_wp_id) : null,
    individuId: ext(p.externalIds).lfh_individu_id !== undefined ? String(ext(p.externalIds).lfh_individu_id) : null,
  }));
  const positionById = new Map<string, Position>(players.map((p) => [p.id, p.position]));
  const clubs = await prisma.club.findMany({ select: { id: true, externalIds: true } });
  const clubIdByTeamId = new Map(clubs.map((c) => [String(ext(c.externalIds).lfh_team_id), c.id]));

  const unresolved: string[] = [];
  const missingSheets: string[] = [];
  type StatFields = Omit<Prisma.PlayerMatchStatUncheckedCreateInput, "matchId" | "playerId">;
  const upserts: { matchId: string; playerId: string; individuId: string; data: StatFields }[] = [];
  let matchesProcessed = 0;

  for (const match of gameweek.matches) {
    const ids = ext(match.externalIds);
    if (match.status !== "FINISHED" || !ids.lfh_rencontre_id) continue;
    matchesProcessed++;

    const official = await provider.fetchMatchOfficialStats(String(ids.lfh_rencontre_id));
    const homeTeamId = [...clubIdByTeamId.entries()].find(([, id]) => id === match.homeClubId)?.[0];
    if (!homeTeamId) throw new IngestionError(`LFH : club domicile sans lfh_team_id (match ${match.id})`, "LFH_SCRAPER", false);

    let sheet: VisionSportSheet | null = null;
    try {
      const filename = ids.lfh_ext_rencontre_id
        ? await provider.fetchVisionSportFilename(String(ids.lfh_ext_rencontre_id))
        : null;
      sheet = filename ? await provider.fetchVisionSportSheet(filename) : null;
    } catch (err) {
      console.warn(`[lfh] feuille vision-sport J${gameweek.number} rencontre ${ids.lfh_rencontre_id} :`, String(err));
    }
    if (!sheet) missingSheets.push(String(ids.lfh_rencontre_id));

    for (const row of mergeLfhMatchStats(official, sheet, homeTeamId)) {
      const clubId = clubIdByTeamId.get(row.teamId);
      const player = clubId ? resolveLfhPlayer(known, row, clubId) : null;
      if (!player) {
        unresolved.push(`${row.firstName} ${row.lastName} (équipe ${row.teamId})`);
        continue;
      }
      const { teamId: _t, individuId, wpPlayerId: _w, firstName: _f, lastName: _l, shirtNumber: _s, isGoalkeeper: _g, secondsPlayed: _sp, ...stats } = row;
      upserts.push({
        matchId: match.id,
        playerId: player.playerId,
        individuId,
        data: {
          ...stats,
          lnhRating: computeMatchRating(row, { played: row.played, position: positionById.get(player.playerId)! }, weights),
          source: "LFH_SCRAPER",
          isLive: false,
        },
      });
    }
  }

  if (upserts.length > 0) {
    await prisma.$transaction(
      upserts.map((u) =>
        prisma.playerMatchStat.upsert({
          where: { matchId_playerId: { matchId: u.matchId, playerId: u.playerId } },
          create: { matchId: u.matchId, playerId: u.playerId, ...u.data },
          update: u.data,
        })
      )
    );
    // Mémorise l'identifiant fédéral des joueuses rapprochées (jointure la plus sûre ensuite).
    const newIndividus = upserts.filter((u) => {
      const k = known.find((x) => x.playerId === u.playerId);
      return k && k.individuId !== u.individuId;
    });
    for (const u of newIndividus) {
      const p = players.find((x) => x.id === u.playerId)!;
      await prisma.player.update({
        where: { id: p.id },
        data: { externalIds: { ...ext(p.externalIds), lfh_individu_id: u.individuId } },
      });
    }
  }

  // Joueuse inconnue sur une feuille (recrue, première apparition) : on rafraîchit
  // l'effectif une fois, puis on rejoue la journée (upserts idempotents).
  if (unresolved.length > 0 && !opts.rosterRefreshed) {
    const roster = await syncLfhRoster(gameweek.seasonId);
    if (roster.created > 0) return syncLfhGameweekStats(gameweekId, { rosterRefreshed: true });
  }

  return { gameweekNumber: gameweek.number, matchesProcessed, statsUpserted: upserts.length, unresolved, missingSheets };
}

// ─────────────────────────── Confirmation ───────────────────────────

export interface LfhConfirmResult {
  gameweekNumber: number;
  ratingChanges: number;
  rescored: boolean;
}

/**
 * Passage au 🟢 (Gameweek.confirmedAt) des journées LFH notées, une fois la
 * fenêtre de correction passée : LFH_CONFIRM_DELAY_HOURS (GameConfig, défaut 48)
 * après la fin du dernier match. Pendant LFH du cron corrections LNH du mardi
 * (§4.3), en plus simple : on relit la feuille officielle et vision-sport ; si une
 * note a bougé, les points de la journée sont recalculés (computeGameweekScores
 * est rejouable), puis la journée est confirmée. Aucun email aux managers.
 */
export async function confirmLfhGameweeks(seasonId: string, now: Date = new Date()): Promise<LfhConfirmResult[]> {
  const config = await loadGameConfig();
  const delayHours = parseFloat(config.LFH_CONFIRM_DELAY_HOURS ?? "48");
  const delay = Number.isFinite(delayHours) ? delayHours : 48;

  const candidates = await prisma.gameweek.findMany({
    where: { seasonId, isScored: true, confirmedAt: null },
    orderBy: { number: "asc" },
    include: { matches: { select: { id: true, kickoffAt: true, status: true } } },
  });

  const results: LfhConfirmResult[] = [];
  for (const gw of candidates) {
    if (!isLfhGameweekReadyToConfirm(gw.matches, now, delay)) continue;

    const ratingsOf = async () =>
      new Map(
        (
          await prisma.playerMatchStat.findMany({
            where: { matchId: { in: gw.matches.map((m) => m.id) }, isLive: false },
            select: { matchId: true, playerId: true, lnhRating: true },
          })
        ).map((s) => [`${s.matchId}:${s.playerId}`, s.lnhRating === null ? null : Number(s.lnhRating)])
      );
    const before = await ratingsOf();
    await syncLfhGameweekStats(gw.id);
    const after = await ratingsOf();
    const ratingChanges = [...after].filter(([k, v]) => before.get(k) !== v).length;

    if (ratingChanges > 0) await computeGameweekScores(gw.id);
    await prisma.gameweek.update({ where: { id: gw.id }, data: { confirmedAt: now } });
    results.push({ gameweekNumber: gw.number, ratingChanges, rescored: ratingChanges > 0 });
  }
  return results;
}

/**
 * Journées jouées AVANT le lancement du jeu (J1 → J6, lancement à J7) : aucune
 * équipe ne les a jouées, et leurs notes sont déjà prises en compte par la
 * valorisation initiale. On les marque notées + confirmées pour que le cron de
 * clôture ne les traite pas comme des journées normales — sinon computeGameweekScores
 * appliquerait l'ajustement hebdomadaire des valeurs (±VALUE_ADJUSTMENT_STEP) une
 * fois par journée, par-dessus la valorisation initiale. Ne touche qu'une journée
 * SANS aucun alignement (inoffensif même relancé après le lancement) et dont tous
 * les matchs sont terminés.
 */
export async function closePreLaunchGameweeks(seasonId: string, now: Date = new Date()): Promise<number[]> {
  const candidates = await prisma.gameweek.findMany({
    where: { seasonId, isScored: false, deadlineAt: { lte: now }, lineups: { none: {} } },
    include: { matches: { select: { status: true } } },
    orderBy: { number: "asc" },
  });
  const closable = candidates.filter(
    (gw) => gw.matches.length > 0 && gw.matches.every((m) => m.status !== "SCHEDULED" && m.status !== "LIVE")
  );
  if (closable.length > 0) {
    await prisma.gameweek.updateMany({
      where: { id: { in: closable.map((g) => g.id) } },
      data: { isScored: true, confirmedAt: now },
    });
  }
  return closable.map((g) => g.number);
}

// ─────────────────────────── Classement ───────────────────────────

export async function syncLfhStandings(seasonId: string, gameweekNumber: number) {
  const scraped = await createLfhProvider().fetchStandings(getLfhPouleId());
  const clubs = await prisma.club.findMany({ select: { id: true, externalIds: true } });
  const clubIdByTeamId = new Map(clubs.map((c) => [String(ext(c.externalIds).lfh_team_id), c.id]));

  const unresolved: string[] = [];
  const rows = scraped.flatMap((s) => {
    const clubId = clubIdByTeamId.get(s.team.teamId);
    if (!clubId) {
      unresolved.push(s.team.name);
      return [];
    }
    return [
      {
        clubId,
        rank: s.rank,
        points: s.points,
        played: s.played,
        wins: s.won,
        draws: s.drawn,
        losses: s.lost,
        goalsFor: s.goalsFor,
        goalsAgainst: s.goalsAgainst,
        goalAvg: s.goalsFor - s.goalsAgainst,
      },
    ];
  });
  // Même garde que côté LNH : jamais un classement en avance dans l'instantané N.
  if (!standingsFitGameweek(rows, gameweekNumber)) {
    return { gameweekNumber, upserted: 0, unresolved, skippedAhead: true };
  }
  const upserted = await snapshotClubStandings(seasonId, gameweekNumber, rows, "LFH_SCRAPER");
  return { gameweekNumber, upserted, unresolved };
}

// ─────────────────────────── Valorisation ───────────────────────────

/**
 * Barème des valeurs LFH : même calcul que pour une recrue LNH en cours de saison
 * (normalisation par poste, lissage des petits échantillons), mais fourchette
 * resserrée (décision du 29/09 : « amplitude moins importante que chez les
 * hommes », qui vont de 4 à 20) et placée pour que le budget reste 140 comme chez
 * les hommes : 7,5 → 17,5 (moyenne ≈ 10,6). GameConfig VALUATION_MIN_VALUE / _MAX_VALUE.
 */
export function parseLfhValuationConfig(raw: Record<string, string>): NewcomerValuationConfig {
  const num = (key: string, fallback: number) => {
    const v = parseFloat(raw[key] ?? "");
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    ...DEFAULT_NEWCOMER_VALUATION_CONFIG,
    minValue: num("VALUATION_MIN_VALUE", 7.5),
    maxValue: num("VALUATION_MAX_VALUE", 17.5),
  };
}

export interface LfhValuationResult {
  valued: number;
  withoutMatch: number;
  averageValue: number;
  /** Budget qui garde la même tension que chez les hommes (140 pour 14 × 10,6 de moyenne). */
  suggestedBudget: number;
}

/**
 * Valeur de départ de chaque joueuse à partir de ses notes calculées depuis le
 * début de la saison (toutes les journées déjà ingérées). Joueuse sans match →
 * valeur plancher. Pré-saison du jeu : historisée avec gameweekId null
 * (delete-puis-create, rejouable, comme /api/admin/valuation/apply-lnh-scores).
 */
export async function valueLfhPlayersFromSeasonStats(seasonId: string): Promise<LfhValuationResult> {
  const config = parseLfhValuationConfig(await loadGameConfig());
  const players = await prisma.player.findMany({
    where: { seasonId },
    select: {
      id: true,
      position: true,
      stats: { where: { isLive: false, played: true, lnhRating: { not: null } }, select: { lnhRating: true } },
    },
  });
  const reference = players.map((p) => ({
    playerId: p.id,
    position: p.position,
    matchesPlayed: p.stats.length,
    totalScore: p.stats.reduce((s, x) => s + Number(x.lnhRating), 0),
  }));
  const values = valueNewcomersFromSeasonScores(reference, players.map((p) => p.id), config);

  await prisma.$transaction([
    ...players.map((p) =>
      prisma.player.update({ where: { id: p.id }, data: { marketValue: values.get(p.id)!, valuationPending: false } })
    ),
    prisma.playerValueHistory.deleteMany({ where: { gameweekId: null, playerId: { in: players.map((p) => p.id) } } }),
    prisma.playerValueHistory.createMany({ data: players.map((p) => ({ playerId: p.id, value: values.get(p.id)! })) }),
  ]);

  const all = [...values.values()];
  const averageValue = all.reduce((s, v) => s + v, 0) / Math.max(1, all.length);
  // Hommes (prod, 29/09) : budget 140 / (14 × 10,57) = 0,946 → même ratio.
  const suggestedBudget = Math.round(14 * averageValue * 0.946 * 2) / 2;
  return {
    valued: players.length,
    withoutMatch: reference.filter((r) => r.matchesPlayed === 0).length,
    averageValue: Math.round(averageValue * 100) / 100,
    suggestedBudget,
  };
}
