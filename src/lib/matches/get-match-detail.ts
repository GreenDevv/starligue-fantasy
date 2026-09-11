// Détail boxscore d'un match précis (page /matches/[id]) — toutes les stats
// détaillées par joueur (buts, dernière passe, ballons récupérés, interceptions...),
// même jeu de colonnes que src/lib/stats/stat-lines.ts.
//
// Cas normal : le match est déjà "décidé" (résultat affiché dans un MatchesStrip/
// ClubMatchesPanel) → PlayerMatchStat est déjà en base, ingéré par le même pipeline
// qui a marqué la journée comme jouée (src/lib/simulation/advance.ts en Simulation,
// src/lib/ingestion/boxscore.ts::syncGameweekBoxscore en live, cron sync-ratings).
// Fallback : si rien en base pour ce match précis (ex: cron pas encore passé côté
// live, décalage possible entre le sync du score et celui du boxscore), on scrape
// et on ingère à la demande — mêmes fonctions que le pipeline normal, donc les
// visites suivantes de CE match retrouveront les données en base sans re-scraper.
//
// Piège anti-spoiler (déjà rencontré dans club-page-data.ts/head-to-head.ts) :
// en mode Simulation, TOUT le calendrier réel 2025/26 est en base dès le setup —
// Match.status ne suffit pas à savoir si un match est "décidé", seul le curseur
// admin (Season.currentSimulationGameweekNumber) fait foi.
import { prisma } from "@/lib/db";
import type { Position } from "@/lib/squad/validation";
import { computePlayerPoints, parseScoringConfig } from "@/lib/scoring/engine";
import {
  createLnhScraperProvider,
  boxscoreRowToStatFields,
  type ScrapedMatchBoxscoreRow,
} from "@/lib/data-providers/lnh-scraper.provider";
import { SIMULATION_SEASON_LABEL, SIMULATION_LNH_SEASONS_ID } from "@/lib/simulation/constants";

// Saison live en cours — même convention (pas encore centralisée) que
// src/app/api/cron/sync-ratings/route.ts.
const LIVE_LNH_SEASONS_ID = "40";

export interface MatchBoxscorePlayerRow {
  playerId: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  position: Position;
  played: boolean;
  lnhRating: number | null;
  // Points fantasy que cette ligne rapporte à un TITULAIRE non capitaine (formule
  // §2.3 : (note−5)×4). Le capitaine double, le remplaçant divise par 2, le bonus
  // « leader de journée » (calculé sur toute la journée) n'est pas inclus ici.
  fantasyPoints: number | null;
  saves: number | null;
  shotsFaced: number | null;
  savePercentage: number | null;
  goalsPlay: number | null;
  shotsPlay: number | null;
  goalsPenalty: number | null;
  shotsPenalty: number | null;
  goalsTotal: number | null;
  shotsTotal: number | null;
  shotPercentage: number | null;
  assists: number | null;
  ballsRecovered: number | null;
  opponentShotsBlocked: number | null;
  penaltiesDrawn: number | null;
  twoMinDrawn: number | null;
  neutralizations: number | null;
  turnovers: number | null;
  twoMinTaken: number | null;
  disqualified: number | null;
}

export interface MatchTeamBoxscore {
  club: { id: string; name: string; shortName: string; logoUrl: string | null };
  goalkeepers: MatchBoxscorePlayerRow[];
  fieldPlayers: MatchBoxscorePlayerRow[];
}

export interface MatchLiveEventRow {
  id: string;
  sequence: number;
  period: string;
  minute: number;
  icon: string;
  homeScore: number;
  awayScore: number;
  text: string;
  player: { id: string; firstName: string; lastName: string; photoUrl: string | null; position: Position } | null;
}

export interface MatchDetail {
  id: string;
  gameweekNumber: number;
  seasonLabel: string;
  kickoffAt: Date;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  liveMinute: number | null;
  livePeriod: string | null;
  home: MatchTeamBoxscore;
  away: MatchTeamBoxscore;
  // Le plus récent en premier (lecture "fil d'actu") — vide hors direct/juste après
  // (pas de suivi événement par événement pour les matchs plus anciens, feature
  // ajoutée le 11/09).
  liveEvents: MatchLiveEventRow[];
}

function toRow(playerId: string, p: { firstName: string; lastName: string; photoUrl: string | null; position: Position }, s: {
  played: boolean;
  lnhRating: unknown;
  saves: number | null;
  shotsFaced: number | null;
  savePercentage: unknown;
  goalsPlay: number | null;
  shotsPlay: number | null;
  goalsPenalty: number | null;
  shotsPenalty: number | null;
  goalsTotal: number | null;
  shotsTotal: number | null;
  shotPercentage: unknown;
  assists: number | null;
  ballsRecovered: number | null;
  opponentShotsBlocked: number | null;
  penaltiesDrawn: number | null;
  twoMinDrawn: number | null;
  neutralizations: number | null;
  turnovers: number | null;
  twoMinTaken: number | null;
  disqualified: number | null;
}, fantasyPoints: number | null): MatchBoxscorePlayerRow {
  return {
    playerId,
    firstName: p.firstName,
    lastName: p.lastName,
    photoUrl: p.photoUrl,
    position: p.position,
    played: s.played,
    lnhRating: s.lnhRating !== null && s.lnhRating !== undefined ? Number(s.lnhRating) : null,
    fantasyPoints,
    saves: s.saves,
    shotsFaced: s.shotsFaced,
    savePercentage: s.savePercentage !== null && s.savePercentage !== undefined ? Number(s.savePercentage) : null,
    goalsPlay: s.goalsPlay,
    shotsPlay: s.shotsPlay,
    goalsPenalty: s.goalsPenalty,
    shotsPenalty: s.shotsPenalty,
    goalsTotal: s.goalsTotal,
    shotsTotal: s.shotsTotal,
    shotPercentage: s.shotPercentage !== null && s.shotPercentage !== undefined ? Number(s.shotPercentage) : null,
    assists: s.assists,
    ballsRecovered: s.ballsRecovered,
    opponentShotsBlocked: s.opponentShotsBlocked,
    penaltiesDrawn: s.penaltiesDrawn,
    twoMinDrawn: s.twoMinDrawn,
    neutralizations: s.neutralizations,
    turnovers: s.turnovers,
    twoMinTaken: s.twoMinTaken,
    disqualified: s.disqualified,
  };
}

// Scrape et ingère (upsert PlayerMatchStat, idempotent) le boxscore d'un match qui
// n'en a pas encore en base — mêmes étapes que syncGameweekBoxscore mais pour un
// seul match, calendars_id résolu à la volée si besoin.
async function scrapeAndIngestBoxscore(
  match: { id: string; externalIds: unknown; gameweek: { number: number }; seasonId: string },
  homeClub: { externalIds: unknown },
  awayClub: { externalIds: unknown },
  seasonLabel: string
): Promise<void> {
  const provider = createLnhScraperProvider();
  const existingExternalIds = (match.externalIds as Record<string, string>) ?? {};
  let calendarsId = existingExternalIds.lnh_calendars_id;

  if (!calendarsId) {
    const homeSlug = (homeClub.externalIds as Record<string, string>)?.lnh;
    const awaySlug = (awayClub.externalIds as Record<string, string>)?.lnh;
    if (!homeSlug || !awaySlug) return;

    const seasonSlug = seasonLabel.replace(/[^0-9]/g, "");
    const resolved = await provider.fetchMatchCalendarsId(seasonSlug, match.gameweek.number, homeSlug, awaySlug);
    if (!resolved) return;

    calendarsId = resolved.calendarsId;
    await prisma.match.update({
      where: { id: match.id },
      data: { externalIds: { ...existingExternalIds, lnh_calendars_id: calendarsId } },
    });
  }

  const lnhSeasonsId = seasonLabel === SIMULATION_SEASON_LABEL ? SIMULATION_LNH_SEASONS_ID : LIVE_LNH_SEASONS_ID;
  const boxscoreMap = await provider.fetchGameweekMatchStats([calendarsId], lnhSeasonsId);
  const rows = boxscoreMap.get(calendarsId) ?? [];
  if (rows.length === 0) return;

  const dbClubs = await prisma.club.findMany();
  const clubShortNameBySlug = new Map<string, string>();
  for (const c of dbClubs) {
    const extIds = (c.externalIds as Record<string, string>) ?? {};
    if (extIds.lnh) clubShortNameBySlug.set(extIds.lnh.toLowerCase(), c.shortName);
  }

  const seasonPlayers = await prisma.player.findMany({
    where: { seasonId: match.seasonId },
    include: { club: { select: { shortName: true } } },
  });
  const playerByKey = new Map<string, (typeof seasonPlayers)[number]>();
  for (const p of seasonPlayers) {
    const key = `${p.lastName.toLowerCase()}|${p.firstName.toLowerCase()}|${p.club.shortName.toLowerCase()}`;
    playerByKey.set(key, p);
  }

  const upserts: Array<{ playerId: string } & ScrapedMatchBoxscoreRow> = [];
  for (const row of rows) {
    const clubShortName = clubShortNameBySlug.get(row.lnhClubSlug.toLowerCase());
    if (!clubShortName) continue;
    const key = `${row.lastName.toLowerCase()}|${row.firstName.toLowerCase()}|${clubShortName.toLowerCase()}`;
    const player = playerByKey.get(key);
    if (!player) continue;
    upserts.push({ playerId: player.id, ...row });
  }

  if (upserts.length > 0) {
    await prisma.$transaction(
      upserts.map((u) => {
        const fields = boxscoreRowToStatFields(u);
        return prisma.playerMatchStat.upsert({
          where: { matchId_playerId: { matchId: match.id, playerId: u.playerId } },
          create: { matchId: match.id, playerId: u.playerId, ...fields },
          update: fields,
        });
      })
    );
  }
}

export async function getMatchDetail(matchId: string): Promise<MatchDetail | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      season: { select: { label: true, currentSimulationGameweekNumber: true } },
      gameweek: { select: { number: true } },
      homeClub: { select: { id: true, name: true, shortName: true, logoUrl: true, externalIds: true } },
      awayClub: { select: { id: true, name: true, shortName: true, logoUrl: true, externalIds: true } },
    },
  });
  if (!match) return null;

  const isSimulation = match.season.label === SIMULATION_SEASON_LABEL;
  // LIVE en plus de FINISHED : un match en cours doit rester visible (score,
  // événements en direct) — seul un match pas encore commencé (SCHEDULED) n'a rien
  // à montrer. Ne change rien à la simulation (curseur admin seul fait foi, cf.
  // commentaire en tête de fichier).
  const isDecided = isSimulation
    ? match.gameweek.number <= match.season.currentSimulationGameweekNumber
    : match.status === "FINISHED" || match.status === "LIVE";
  if (!isDecided) return null;

  let stats = await prisma.playerMatchStat.findMany({
    where: { matchId },
    include: { player: { select: { id: true, firstName: true, lastName: true, photoUrl: true, position: true, clubId: true } } },
  });

  // Le boxscore lnh.fr n'existe qu'après le coup de sifflet final — inutile de
  // tenter un scrape à la demande pendant qu'un match est encore LIVE (rien à
  // trouver, juste une requête gâchée). La page affiche le tableau vide
  // ("Statistiques indisponibles") + la timeline d'événements en attendant.
  if (stats.length === 0 && match.status !== "LIVE") {
    await scrapeAndIngestBoxscore(match, match.homeClub, match.awayClub, match.season.label);
    stats = await prisma.playerMatchStat.findMany({
      where: { matchId },
      include: { player: { select: { id: true, firstName: true, lastName: true, photoUrl: true, position: true, clubId: true } } },
    });
  }

  const liveEventRows = await prisma.matchLiveEvent.findMany({
    where: { matchId },
    orderBy: { sequence: "desc" },
    include: {
      player: { select: { id: true, firstName: true, lastName: true, photoUrl: true, position: true } },
    },
  });

  const { homeClub, awayClub } = match;

  const scoringConfig = parseScoringConfig(
    Object.fromEntries((await prisma.gameConfig.findMany()).map((c) => [c.key, c.value]))
  );
  const homeWon = match.homeScore !== null && match.awayScore !== null && match.homeScore > match.awayScore;
  const awayWon = match.homeScore !== null && match.awayScore !== null && match.awayScore > match.homeScore;

  function buildTeam(club: typeof homeClub | typeof awayClub): MatchTeamBoxscore {
    const teamWon = club.id === homeClub.id ? homeWon : awayWon;
    const rows = stats
      .filter((s) => s.player.clubId === club.id)
      .map((s) => {
        const rating = s.lnhRating !== null && s.lnhRating !== undefined ? Number(s.lnhRating) : null;
        const fantasyPoints =
          rating !== null && s.played
            ? computePlayerPoints({ lnhRating: rating, played: true, role: "STARTER", teamWon }, scoringConfig)
            : s.played
              ? 0
              : null;
        return toRow(s.player.id, s.player, s, fantasyPoints);
      });
    return {
      club: { id: club.id, name: club.name, shortName: club.shortName, logoUrl: club.logoUrl },
      goalkeepers: rows.filter((r) => r.position === "GK"),
      fieldPlayers: rows.filter((r) => r.position !== "GK"),
    };
  }

  return {
    id: match.id,
    gameweekNumber: match.gameweek.number,
    seasonLabel: match.season.label,
    kickoffAt: match.kickoffAt,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    status: match.status,
    liveMinute: match.liveMinute,
    livePeriod: match.livePeriod,
    home: buildTeam(match.homeClub),
    away: buildTeam(match.awayClub),
    liveEvents: liveEventRows.map((e) => ({
      id: e.id,
      sequence: e.sequence,
      period: e.period,
      minute: e.minute,
      icon: e.icon,
      homeScore: e.homeScore,
      awayScore: e.awayScore,
      text: e.text,
      player: e.player,
    })),
  };
}
