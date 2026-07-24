// Pipeline d'ingestion des stats détaillées de boxscore (lnh.fr) pour la saison en
// direct — même donnée et même parseur que le Mode Simulation
// (src/lib/simulation/advance.ts), mais orchestré par journée entière plutôt que par
// équipe utilisateur (pas de notion d'équipe côté ingestion, la sync est globale à
// la journée). Contrairement à la simulation (alimentée directement au setup via
// fetchSeasonCalendar), les matchs de la saison en direct n'ont pas de
// `externalIds.lnh_calendars_id` (import initial fait par CSV, cf.
// prisma/fixtures_starligue_2026.csv) — syncCalendarsIdsForSeason() le résout.
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
}

/**
 * Résout `Match.externalIds.lnh_calendars_id` pour tous les matchs déjà en base
 * d'une saison, en les rapprochant du calendrier lnh.fr (journée + clubs domicile/
 * extérieur). Idempotent — ne touche pas aux matchs qui ont déjà un calendars_id.
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
      select: { id: true, externalIds: true },
    });
    if (!match) {
      unresolved++;
      continue;
    }

    const externalIds = (match.externalIds as Record<string, string>) ?? {};
    if (externalIds.lnh_calendars_id) {
      alreadyKnown++;
      continue;
    }

    await prisma.match.update({
      where: { id: match.id },
      data: { externalIds: { ...externalIds, lnh_calendars_id: fixture.calendarsId } },
    });
    resolved++;
  }

  return { resolved, alreadyKnown, unresolved };
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
