// Pipeline d'ingestion des stats détaillées de boxscore (lnh.fr) pour la saison en
// direct — même donnée et même parseur que le Mode Simulation
// (src/lib/simulation/advance.ts), mais orchestré par journée entière plutôt que par
// équipe utilisateur (pas de notion d'équipe côté ingestion, la sync est globale à
// la journée). Contrairement à la simulation (alimentée directement au setup via
// fetchSeasonCalendar), les matchs de la saison en direct n'ont pas de
// `externalIds.lnh_calendars_id` (import initial fait par CSV, cf.
// prisma/fixtures_starligue_2026.csv) — syncCalendarsIdsForSeason() le résout.
//
// Cette même fonction met AUSSI à jour Match.status/homeScore/awayScore depuis le
// calendrier lnh.fr (2026-07-30) : jusque-là rien ne le faisait pour la saison en
// direct (le score/scoring fantasy ne dépend que de PlayerMatchStat, indépendant de
// Match — mais les pages de détail match/club, le H2H et le règlement des pronostics
// §14 en ont besoin). fetchSeasonCalendar() renvoyait déjà ces champs
// (ScrapedFixture.status/homeScore/awayScore, utilisés depuis le début pour le Mode
// Simulation), seule l'écriture côté saison en direct manquait.
//
// Depuis le 2026-08-27 (ARCHITECTURE.md §4.2) : synchronise aussi Match.kickoffAt et
// le diffuseur TV (broadcasterName/broadcasterUrl). lnh.fr publie d'abord une date
// générique par journée (ex: J1 → 4 septembre pour tous les matchs), puis ajuste
// chaque match individuellement (±2 jours) une fois les horaires TV confirmés — le
// calendrier initial (import CSV unique, prisma/fixtures_starligue_2026.csv) fige
// cette date générique tant que rien ne la corrige. Un kickoffAt qui change entraîne
// aussi un recalcul de Gameweek.deadlineAt (1h avant le 1er match de la journée,
// même règle qu'à l'import initial — voir sync.ts) : UNIQUEMENT si la journée n'est
// pas encore notée ET que la nouvelle deadline calculée reste dans le futur, pour ne
// jamais faire apparaître d'un coup, sans préavis, une deadline déjà passée.
import { prisma } from "@/lib/db";
import {
  createLnhScraperProvider,
  boxscoreRowToStatFields,
  type ScrapedMatchBoxscoreRow,
} from "@/lib/data-providers/lnh-scraper.provider";

export interface CalendarsIdSyncResult {
  resolved: number;
  alreadyKnown: number;
  unresolved: number;
  /** Matchs dont le statut et/ou le score ont été mis à jour depuis lnh.fr sur ce run. */
  resultsUpdated: number;
  /** Matchs dont le coup d'envoi et/ou le diffuseur TV ont été mis à jour depuis lnh.fr. */
  scheduleUpdated: number;
  /** Journées dont la deadline a été recalculée suite à un changement de coup d'envoi. */
  deadlinesUpdated: number;
}

/**
 * Résout `Match.externalIds.lnh_calendars_id` pour tous les matchs déjà en base
 * d'une saison, en les rapprochant du calendrier lnh.fr (journée + clubs domicile/
 * extérieur). Met aussi à jour `Match.status`/`homeScore`/`awayScore`/`kickoffAt`/
 * diffuseur TV depuis ce même calendrier (et `Gameweek.deadlineAt` en conséquence,
 * voir plus haut). Idempotent — ne réécrit rien pour un match dont le calendars_id
 * est déjà connu ET dont statut/score/horaire/diffuseur correspondent déjà à la
 * dernière valeur scrapée.
 */
export async function syncCalendarsIdsForSeason(
  seasonId: string,
  lnhSeasonsId: string,
  seasonStartYear: number
): Promise<CalendarsIdSyncResult> {
  const provider = createLnhScraperProvider();
  const fixtures = await provider.fetchSeasonCalendar(lnhSeasonsId, seasonStartYear);

  const dbClubs = await prisma.club.findMany();
  const clubIdBySlug = new Map<string, string>();
  for (const c of dbClubs) {
    const extIds = (c.externalIds as Record<string, string>) ?? {};
    if (extIds.lnh) clubIdBySlug.set(extIds.lnh.toLowerCase(), c.id);
  }

  let resolved = 0;
  let alreadyKnown = 0;
  let unresolved = 0;
  let resultsUpdated = 0;
  let scheduleUpdated = 0;
  const gameweeksWithScheduleChange = new Set<string>();

  for (const fixture of fixtures) {
    const homeClubId = clubIdBySlug.get(fixture.homeClubSlug.toLowerCase());
    const awayClubId = clubIdBySlug.get(fixture.awayClubSlug.toLowerCase());
    if (!homeClubId || !awayClubId) {
      unresolved++;
      continue;
    }

    const gameweek = await prisma.gameweek.findUnique({
      where: { seasonId_number: { seasonId, number: fixture.gameweekNumber } },
      select: { id: true },
    });
    if (!gameweek) {
      unresolved++;
      continue;
    }

    const match = await prisma.match.findFirst({
      where: { gameweekId: gameweek.id, homeClubId, awayClubId },
      select: {
        id: true,
        externalIds: true,
        status: true,
        homeScore: true,
        awayScore: true,
        kickoffAt: true,
        broadcasterName: true,
        broadcasterUrl: true,
      },
    });
    if (!match) {
      unresolved++;
      continue;
    }

    const externalIds = (match.externalIds as Record<string, string>) ?? {};
    const needsCalendarsId = !externalIds.lnh_calendars_id;
    const needsResultUpdate =
      match.status !== fixture.status ||
      match.homeScore !== fixture.homeScore ||
      match.awayScore !== fixture.awayScore;
    const needsScheduleUpdate =
      match.kickoffAt.getTime() !== fixture.kickoffAt.getTime() ||
      match.broadcasterName !== fixture.broadcasterName ||
      match.broadcasterUrl !== fixture.broadcasterUrl;

    if (!needsCalendarsId && !needsResultUpdate && !needsScheduleUpdate) {
      alreadyKnown++;
      continue;
    }

    if (match.kickoffAt.getTime() !== fixture.kickoffAt.getTime()) {
      gameweeksWithScheduleChange.add(gameweek.id);
    }

    await prisma.match.update({
      where: { id: match.id },
      data: {
        ...(needsCalendarsId ? { externalIds: { ...externalIds, lnh_calendars_id: fixture.calendarsId } } : {}),
        ...(needsResultUpdate
          ? {
              status: fixture.status as "SCHEDULED" | "FINISHED",
              homeScore: fixture.homeScore,
              awayScore: fixture.awayScore,
            }
          : {}),
        ...(needsScheduleUpdate
          ? {
              kickoffAt: fixture.kickoffAt,
              broadcasterName: fixture.broadcasterName,
              broadcasterUrl: fixture.broadcasterUrl,
            }
          : {}),
      },
    });
    if (needsCalendarsId) resolved++;
    if (needsResultUpdate) resultsUpdated++;
    if (needsScheduleUpdate) scheduleUpdated++;
  }

  const deadlinesUpdated = await recomputeGameweekDeadlines(gameweeksWithScheduleChange);

  return { resolved, alreadyKnown, unresolved, resultsUpdated, scheduleUpdated, deadlinesUpdated };
}

// Recalcule Gameweek.deadlineAt = 1h avant le match le plus tôt de la journée (même
// règle qu'à l'import CSV initial, voir sync.ts) pour les journées dont au moins un
// match a changé de kickoffAt. Ignore une journée déjà notée (isScored — terminée,
// plus aucune raison de bouger sa deadline) et n'applique la nouvelle valeur QUE si
// elle reste dans le futur : si le recalcul donnait une deadline déjà passée, mieux
// vaut laisser l'ancienne valeur en place (déjà passée ou non) que de faire
// apparaître d'un coup, sans aucun préavis pour les joueurs, une deadline désormais
// derrière eux.
async function recomputeGameweekDeadlines(gameweekIds: Set<string>): Promise<number> {
  let updated = 0;
  const now = new Date();

  for (const gameweekId of gameweekIds) {
    const gameweek = await prisma.gameweek.findUnique({
      where: { id: gameweekId },
      select: { deadlineAt: true, isScored: true, matches: { select: { kickoffAt: true } } },
    });
    if (!gameweek || gameweek.isScored || gameweek.matches.length === 0) continue;

    const earliestKickoff = new Date(Math.min(...gameweek.matches.map((m) => m.kickoffAt.getTime())));
    const newDeadline = new Date(earliestKickoff.getTime() - 60 * 60 * 1000);

    if (newDeadline.getTime() === gameweek.deadlineAt.getTime() || newDeadline <= now) continue;

    await prisma.gameweek.update({ where: { id: gameweekId }, data: { deadlineAt: newDeadline } });
    updated++;
  }

  return updated;
}

export interface GameweekBoxscoreSyncResult {
  gameweekNumber: number;
  matchesProcessed: number;
  statsUpserted: number;
}

/**
 * Scrape et upsert les stats détaillées de boxscore de tous les matchs joués d'une
 * journée de la saison en direct. Reprend le même flux que
 * src/lib/simulation/advance.ts (résolution club slug → joueur par nom+club, upsert
 * PlayerMatchStat via boxscoreRowToStatFields), mais pour tous les matchs de la
 * journée d'un coup plutôt que pour l'équipe d'un seul utilisateur.
 */
export async function syncGameweekBoxscore(
  gameweekId: string,
  lnhSeasonsId: string
): Promise<GameweekBoxscoreSyncResult> {
  const gameweek = await prisma.gameweek.findUniqueOrThrow({
    where: { id: gameweekId },
    include: { matches: true },
  });

  const matchesWithCalendarsId = gameweek.matches
    .map((m) => ({ match: m, calendarsId: (m.externalIds as Record<string, string>)?.lnh_calendars_id }))
    .filter((x): x is { match: (typeof gameweek.matches)[number]; calendarsId: string } => Boolean(x.calendarsId));

  if (matchesWithCalendarsId.length === 0) {
    return { gameweekNumber: gameweek.number, matchesProcessed: 0, statsUpserted: 0 };
  }

  const provider = createLnhScraperProvider();
  const boxscoresByCalendarsId = await provider.fetchGameweekMatchStats(
    matchesWithCalendarsId.map((x) => x.calendarsId),
    lnhSeasonsId
  );

  const dbClubs = await prisma.club.findMany();
  const clubShortNameBySlug = new Map<string, string>();
  for (const c of dbClubs) {
    const extIds = (c.externalIds as Record<string, string>) ?? {};
    if (extIds.lnh) clubShortNameBySlug.set(extIds.lnh.toLowerCase(), c.shortName);
  }

  const seasonPlayers = await prisma.player.findMany({
    where: { seasonId: gameweek.seasonId },
    include: { club: { select: { shortName: true } } },
  });
  const playerByKey = new Map<string, (typeof seasonPlayers)[number]>();
  for (const p of seasonPlayers) {
    const key = `${p.lastName.toLowerCase()}|${p.firstName.toLowerCase()}|${p.club.shortName.toLowerCase()}`;
    playerByKey.set(key, p);
  }

  const statUpserts: Array<{ matchId: string; playerId: string } & ScrapedMatchBoxscoreRow> = [];
  for (const { match, calendarsId } of matchesWithCalendarsId) {
    const rows = boxscoresByCalendarsId.get(calendarsId) ?? [];
    for (const row of rows) {
      const clubShortName = clubShortNameBySlug.get(row.lnhClubSlug.toLowerCase());
      if (!clubShortName) continue;
      const key = `${row.lastName.toLowerCase()}|${row.firstName.toLowerCase()}|${clubShortName.toLowerCase()}`;
      const player = playerByKey.get(key);
      if (!player) continue;
      statUpserts.push({ matchId: match.id, playerId: player.id, ...row });
    }
  }

  if (statUpserts.length > 0) {
    await prisma.$transaction(
      statUpserts.map((u) => {
        const fields = boxscoreRowToStatFields(u);
        return prisma.playerMatchStat.upsert({
          where: { matchId_playerId: { matchId: u.matchId, playerId: u.playerId } },
          create: { matchId: u.matchId, playerId: u.playerId, ...fields },
          update: fields,
        });
      })
    );
  }

  return {
    gameweekNumber: gameweek.number,
    matchesProcessed: matchesWithCalendarsId.length,
    statsUpserted: statUpserts.length,
  };
}
