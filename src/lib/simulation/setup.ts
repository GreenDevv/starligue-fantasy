// Setup d'une saison historique pour le Mode Simulation — importe clubs/calendrier/
// joueurs depuis lnh.fr et valorise les joueurs d'après leur Score LNH de la saison
// précédente. Idempotent (upsert), ré-exécutable sans doublon. Ne touche jamais aux
// données de la saison active 2026/27 (Season/Club/Player/Match/Gameweek partagés
// mais scopés par seasonId, sauf Club qui est global — les clubs déjà connus sont
// réutilisés tels quels).
import { prisma } from "@/lib/db";
import { createLnhScraperProvider } from "@/lib/data-providers/lnh-scraper.provider";
import { matchPlayerSeasonScores, type ScrapedScoreRow } from "@/lib/players/lnh-score-matching";
import { computeValuationsFromLnhScores, type PlayerLnhScoreInput } from "@/lib/players/valuation";
import type { Position } from "@/lib/squad/validation";

const HOUR = 60 * 60 * 1000;

// Clubs qui ne sont plus en Daikin StarLigue 2026/27 (relégués) mais qui apparaissent
// dans les saisons passées — fallback si le slug n'est pas déjà connu via
// Club.externalIds.lnh. Complète LNH_SLUG_MAP de src/app/api/admin/import/lnh-roster.
const RELEGATED_CLUB_FALLBACK: Record<string, { shortName: string; fullName: string }> = {
  istres: { shortName: "IPH", fullName: "Istres Provence Handball" },
  dijon: { shortName: "GDH", fullName: "Grand Dijon Handball" },
};

function titleCase(slug: string): string {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export interface SimulationSeasonSetupResult {
  seasonId: string;
  seasonLabel: string;
  clubsCreated: number;
  gameweeksImported: number;
  matchesImported: number;
  playersImported: number;
  priorSeasonLabel: string;
  playersScored: number;
  playersValued: number;
  playersPendingValuation: number;
}

export async function setupSimulationSeason(opts: {
  seasonLabel: string; // "2025-2026"
  lnhSeasonsId: string; // "39"
  seasonStartYear: number; // 2025
  priorLnhSeasonsId: string; // "37" (2024/2025) — sert à la valorisation
  priorSeasonLabel: string; // "2024/2025"
}): Promise<SimulationSeasonSetupResult> {
  const { seasonLabel, lnhSeasonsId, seasonStartYear, priorLnhSeasonsId, priorSeasonLabel } = opts;
  const provider = createLnhScraperProvider();

  // --- 1. Saison ---
  const season = await prisma.season.upsert({
    where: { label: seasonLabel },
    update: {},
    create: { label: seasonLabel, isActive: false },
  });

  // --- 2. Résolution des clubs (existants + à créer) ---
  const dbClubs = await prisma.club.findMany();
  const clubIdBySlug = new Map<string, string>();
  for (const c of dbClubs) {
    const extIds = (c.externalIds as Record<string, string>) ?? {};
    if (extIds.lnh) clubIdBySlug.set(extIds.lnh.toLowerCase(), c.id);
  }
  let clubsCreated = 0;

  async function resolveClubId(slug: string): Promise<string> {
    const key = slug.toLowerCase();
    const existing = clubIdBySlug.get(key);
    if (existing) return existing;

    const fallback = RELEGATED_CLUB_FALLBACK[key];
    const shortName = fallback?.shortName ?? slug.toUpperCase().slice(0, 8);
    const fullName = fallback?.fullName ?? titleCase(slug);

    const created = await prisma.club.create({
      data: { name: fullName, shortName, externalIds: { lnh: key } },
    });
    clubIdBySlug.set(key, created.id);
    clubsCreated++;
    return created.id;
  }

  // --- 3. Calendrier (240 matchs, un seul fetch) ---
  const fixtures = await provider.fetchSeasonCalendar(lnhSeasonsId, seasonStartYear);
  if (fixtures.length === 0) {
    throw new Error(`Aucun match trouvé pour seasons_id=${lnhSeasonsId}`);
  }

  const fixturesByGameweek = new Map<number, typeof fixtures>();
  for (const f of fixtures) {
    const list = fixturesByGameweek.get(f.gameweekNumber) ?? [];
    list.push(f);
    fixturesByGameweek.set(f.gameweekNumber, list);
  }

  let gameweeksImported = 0;
  let matchesImported = 0;
  for (const [number, rows] of fixturesByGameweek) {
    const deadlineAt = new Date(Math.min(...rows.map((r) => r.kickoffAt.getTime())) - HOUR);
    const gw = await prisma.gameweek.upsert({
      where: { seasonId_number: { seasonId: season.id, number } },
      update: { deadlineAt },
      create: { seasonId: season.id, number, deadlineAt },
    });
    gameweeksImported++;

    for (const row of rows) {
      const homeClubId = await resolveClubId(row.homeClubSlug);
      const awayClubId = await resolveClubId(row.awayClubSlug);

      const existing = await prisma.match.findFirst({
        where: { gameweekId: gw.id, homeClubId, awayClubId },
      });
      const data = {
        seasonId: season.id,
        gameweekId: gw.id,
        homeClubId,
        awayClubId,
        kickoffAt: row.kickoffAt,
        status: row.status,
        homeScore: row.homeScore,
        awayScore: row.awayScore,
        externalIds: { lnh_calendars_id: row.calendarsId },
      };
      if (existing) {
        await prisma.match.update({ where: { id: existing.id }, data });
      } else {
        await prisma.match.create({ data });
      }
      matchesImported++;
    }
  }

  // --- 4. Joueurs de la saison ---
  const scrapedPlayers = await provider.fetchPlayers(lnhSeasonsId);
  let playersImported = 0;
  for (const p of scrapedPlayers) {
    const clubId = await resolveClubId(p.lnhClubSlug);
    await prisma.player.upsert({
      where: {
        seasonId_clubId_firstName_lastName: {
          seasonId: season.id,
          clubId,
          firstName: p.firstName,
          lastName: p.lastName,
        },
      },
      update: { position: p.position as Position },
      create: {
        seasonId: season.id,
        clubId,
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position as Position,
        marketValue: 7.0, // placeholder, remplacé à l'étape 5 pour les joueurs avec un score
        externalIds: {},
      },
    });
    playersImported++;
  }

  // --- 5. Valorisation d'après le Score LNH de la saison précédente ---
  const priorScores = await provider.fetchSeasonScores(priorLnhSeasonsId);
  const clubShortNameBySlug = new Map<string, string>();
  for (const [slug, id] of clubIdBySlug) {
    const club = dbClubs.find((c) => c.id === id) ?? (await prisma.club.findUnique({ where: { id } }));
    if (club) clubShortNameBySlug.set(slug, club.shortName);
  }

  const seasonPlayers = await prisma.player.findMany({
    where: { seasonId: season.id },
    include: { club: { select: { shortName: true } } },
  });

  const scoreRows: ScrapedScoreRow[] = priorScores.map((s) => ({
    firstName: s.firstName,
    lastName: s.lastName,
    clubShortName: clubShortNameBySlug.get(s.lnhClubSlug.toLowerCase()) ?? s.lnhClubSlug,
    matchesPlayed: s.matchesPlayed,
    totalScore: s.totalScore,
  }));

  const { matches } = matchPlayerSeasonScores(
    scoreRows,
    seasonPlayers.map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, clubShortName: p.club.shortName })),
  );

  if (matches.length > 0) {
    await prisma.$transaction(
      matches.map((m) =>
        prisma.playerLnhSeasonStat.upsert({
          where: { playerId_seasonLabel: { playerId: m.playerId, seasonLabel: priorSeasonLabel } },
          create: {
            playerId: m.playerId,
            seasonLabel: priorSeasonLabel,
            lnhSeasonsId: priorLnhSeasonsId,
            matchesPlayed: m.matchesPlayed,
            totalLnhScore: m.totalScore,
            avgLnhScore: m.avgScore,
            scrapedClub: m.scrapedClub,
            matchedByNameOnly: m.matchedByNameOnly,
          },
          update: {
            lnhSeasonsId: priorLnhSeasonsId,
            matchesPlayed: m.matchesPlayed,
            totalLnhScore: m.totalScore,
            avgLnhScore: m.avgScore,
            scrapedClub: m.scrapedClub,
            matchedByNameOnly: m.matchedByNameOnly,
          },
        })
      )
    );
  }

  const valuationInputs: PlayerLnhScoreInput[] = matches.map((m) => {
    const player = seasonPlayers.find((p) => p.id === m.playerId)!;
    return { playerId: m.playerId, position: player.position as Position, avgLnhScore: m.avgScore };
  });
  const valuations = computeValuationsFromLnhScores(valuationInputs);

  if (valuations.length > 0) {
    await prisma.$transaction(
      valuations.flatMap((v) => [
        prisma.player.update({
          where: { id: v.playerId },
          data: { marketValue: v.marketValue, valuationPending: false },
        }),
        prisma.playerValueHistory.create({ data: { playerId: v.playerId, value: v.marketValue } }),
      ])
    );
  }

  return {
    seasonId: season.id,
    seasonLabel,
    clubsCreated,
    gameweeksImported,
    matchesImported,
    playersImported,
    priorSeasonLabel,
    playersScored: matches.length,
    playersValued: valuations.length,
    playersPendingValuation: playersImported - matches.length,
  };
}
