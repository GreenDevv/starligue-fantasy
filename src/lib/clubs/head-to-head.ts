// Historique des confrontations directes entre deux clubs (10 dernières
// rencontres), pour la page de comparaison /clubs/[id]/vs/[opponentId].
//
// Trois sources combinées, dans cet ordre :
//   1. Nos propres matchs déjà en base (live 2026/27 + Simulation 2025/26,
//      Player/Club/Match partagés multi-saison) — zéro scraping, ces deux
//      saisons couvrent déjà l'essentiel pour deux clubs qui se rencontrent
//      régulièrement. Même piège anti-spoiler que src/lib/clubs/club-page-data.ts :
//      en Simulation, TOUT le calendrier réel est déjà en base dès le setup, seul
//      le curseur admin (Season.currentSimulationGameweekNumber) dit ce qui est
//      "décidé" — Match.status ne suffit pas.
//   2. Cache `ClubHeadToHeadMatch` (rencontres plus anciennes déjà scrapées lors
//      d'une visite précédente de cette paire de clubs).
//   3. Backfill live sur lnh.fr (saisons antérieures à 2025/26), borné à
//      MAX_SEASONS_TO_SCAN requêtes séquentielles pour ne pas bloquer la page si
//      les deux clubs se sont rarement rencontrés (ex: club fraîchement promu) —
//      chaque match trouvé est upserté dans le cache par son `lnh_calendars_id`
//      (externalId, ingestion idempotente).
import { prisma } from "@/lib/db";
import { createLnhScraperProvider } from "@/lib/data-providers/lnh-scraper.provider";
import { SIMULATION_SEASON_LABEL } from "@/lib/simulation/constants";

export interface HeadToHeadMatch {
  playedAt: Date;
  seasonLabel: string;
  clubAIsHome: boolean;
  clubAScore: number;
  clubBScore: number;
}

const TARGET_COUNT = 10;

// Saisons lnh.fr antérieures à ce que Match couvre déjà (2025/26 Simulation,
// 2026/27 live) — id interne lnh.fr + première année civile de la saison (sert à
// dater les matchs, cf. inferYear dans lnh-scraper.provider.ts). Liste établie à
// partir des options du <select name="seasons_id"> d'une page profil joueur
// (cf. mémoire lnh-season-scores-endpoint) ; pas encore centralisée ailleurs dans
// le projet (plusieurs routes ont leur propre id en dur pour la saison courante).
const HISTORICAL_SEASONS = [
  { id: "37", label: "2024/2025", startYear: 2024 },
  { id: "36", label: "2023/2024", startYear: 2023 },
  { id: "34", label: "2022/2023", startYear: 2022 },
  { id: "33", label: "2021/2022", startYear: 2021 },
  { id: "32", label: "2020/2021", startYear: 2020 },
  { id: "31", label: "2019/2020", startYear: 2019 },
  { id: "30", label: "2018/2019", startYear: 2018 },
  { id: "29", label: "2017/2018", startYear: 2017 },
  { id: "28", label: "2016/2017", startYear: 2016 },
  { id: "27", label: "2015/2016", startYear: 2015 },
  { id: "26", label: "2014/2015", startYear: 2014 },
  { id: "25", label: "2013/2014", startYear: 2013 },
  { id: "24", label: "2012/2013", startYear: 2012 },
  { id: "3", label: "2011/2012", startYear: 2011 },
  { id: "1", label: "2010/2011", startYear: 2010 },
  { id: "2", label: "2009/2010", startYear: 2009 },
  { id: "8", label: "2008/2009", startYear: 2008 },
] as const;

const MAX_SEASONS_TO_SCAN = 8;

function toEntry(clubAId: string, homeClubId: string, awayClubId: string, homeScore: number, awayScore: number, playedAt: Date, seasonLabel: string): HeadToHeadMatch {
  const clubAIsHome = homeClubId === clubAId;
  return {
    playedAt,
    seasonLabel,
    clubAIsHome,
    clubAScore: clubAIsHome ? homeScore : awayScore,
    clubBScore: clubAIsHome ? awayScore : homeScore,
  };
}

function sortDescDedup(entries: HeadToHeadMatch[]): HeadToHeadMatch[] {
  const seen = new Set<string>();
  const deduped = entries.filter((e) => {
    const key = e.playedAt.toISOString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return deduped.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
}

async function getDecidedMatchesFromOwnDb(clubAId: string, clubBId: string): Promise<HeadToHeadMatch[]> {
  const [liveSeason, simSeason] = await Promise.all([
    prisma.season.findFirst({ where: { isActive: true } }),
    prisma.season.findUnique({ where: { label: SIMULATION_SEASON_LABEL } }),
  ]);

  const entries: HeadToHeadMatch[] = [];

  for (const season of [liveSeason, simSeason]) {
    if (!season) continue;
    const isSimulation = season.label === SIMULATION_SEASON_LABEL;
    const cursor = isSimulation ? season.currentSimulationGameweekNumber : null;

    const matches = await prisma.match.findMany({
      where: {
        seasonId: season.id,
        OR: [
          { homeClubId: clubAId, awayClubId: clubBId },
          { homeClubId: clubBId, awayClubId: clubAId },
        ],
      },
      include: { gameweek: { select: { number: true } } },
    });

    for (const m of matches) {
      const isDecided = isSimulation ? m.gameweek.number <= (cursor ?? 0) : m.status === "FINISHED";
      if (!isDecided || m.homeScore === null || m.awayScore === null) continue;
      entries.push(toEntry(clubAId, m.homeClubId, m.awayClubId, m.homeScore, m.awayScore, m.kickoffAt, season.label));
    }
  }

  return entries;
}

async function getCachedMatches(clubAId: string, clubBId: string): Promise<HeadToHeadMatch[]> {
  const cached = await prisma.clubHeadToHeadMatch.findMany({
    where: {
      OR: [
        { homeClubId: clubAId, awayClubId: clubBId },
        { homeClubId: clubBId, awayClubId: clubAId },
      ],
    },
  });
  return cached.map((m) => toEntry(clubAId, m.homeClubId, m.awayClubId, m.homeScore, m.awayScore, m.playedAt, m.seasonLabel));
}

// Scrape les saisons historiques une à une (les plus récentes d'abord) jusqu'à
// atteindre TARGET_COUNT rencontres au total ou épuiser MAX_SEASONS_TO_SCAN —
// chaque match trouvé est upserté dans le cache (idempotent, externalId =
// lnh_calendars_id) pour ne jamais re-scrapper cette saison pour cette paire.
async function backfillFromLnh(
  clubAId: string,
  clubBId: string,
  clubASlug: string,
  clubBSlug: string,
  alreadyFound: number
): Promise<HeadToHeadMatch[]> {
  const provider = createLnhScraperProvider();
  const entries: HeadToHeadMatch[] = [];
  let total = alreadyFound;

  for (const season of HISTORICAL_SEASONS.slice(0, MAX_SEASONS_TO_SCAN)) {
    if (total >= TARGET_COUNT) break;

    let fixtures;
    try {
      fixtures = await provider.fetchSeasonCalendar(season.id, season.startYear);
    } catch {
      continue; // saison inaccessible (erreur réseau/parsing) — on continue avec les suivantes
    }

    const headToHead = fixtures.filter(
      (f) =>
        f.status === "FINISHED" &&
        f.homeScore !== null &&
        f.awayScore !== null &&
        ((f.homeClubSlug === clubASlug && f.awayClubSlug === clubBSlug) ||
          (f.homeClubSlug === clubBSlug && f.awayClubSlug === clubASlug))
    );

    for (const f of headToHead) {
      const homeClubId = f.homeClubSlug === clubASlug ? clubAId : clubBId;
      const awayClubId = f.awayClubSlug === clubASlug ? clubAId : clubBId;

      await prisma.clubHeadToHeadMatch.upsert({
        where: { homeClubId_awayClubId_playedAt: { homeClubId, awayClubId, playedAt: f.kickoffAt } },
        update: {
          homeScore: f.homeScore!,
          awayScore: f.awayScore!,
          seasonLabel: season.label,
          externalIds: { lnh_calendars_id: f.calendarsId },
          source: "LNH_SCRAPER",
        },
        create: {
          homeClubId,
          awayClubId,
          playedAt: f.kickoffAt,
          seasonLabel: season.label,
          homeScore: f.homeScore!,
          awayScore: f.awayScore!,
          externalIds: { lnh_calendars_id: f.calendarsId },
          source: "LNH_SCRAPER",
        },
      });

      entries.push(toEntry(clubAId, homeClubId, awayClubId, f.homeScore!, f.awayScore!, f.kickoffAt, season.label));
      total++;
    }
  }

  return entries;
}

export async function getHeadToHead(clubAId: string, clubBId: string): Promise<HeadToHeadMatch[]> {
  const ownDbMatches = await getDecidedMatchesFromOwnDb(clubAId, clubBId);
  let entries = sortDescDedup(ownDbMatches);
  if (entries.length >= TARGET_COUNT) return entries.slice(0, TARGET_COUNT);

  const cached = await getCachedMatches(clubAId, clubBId);
  entries = sortDescDedup([...entries, ...cached]);
  if (entries.length >= TARGET_COUNT) return entries.slice(0, TARGET_COUNT);

  const [clubA, clubB] = await Promise.all([
    prisma.club.findUnique({ where: { id: clubAId }, select: { externalIds: true } }),
    prisma.club.findUnique({ where: { id: clubBId }, select: { externalIds: true } }),
  ]);
  const clubASlug = (clubA?.externalIds as Record<string, string> | undefined)?.lnh;
  const clubBSlug = (clubB?.externalIds as Record<string, string> | undefined)?.lnh;
  if (!clubASlug || !clubBSlug) return entries.slice(0, TARGET_COUNT);

  const scraped = await backfillFromLnh(clubAId, clubBId, clubASlug, clubBSlug, entries.length);
  entries = sortDescDedup([...entries, ...scraped]);

  return entries.slice(0, TARGET_COUNT);
}
