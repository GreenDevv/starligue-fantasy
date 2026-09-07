// Classement général fantasy PROVISOIRE, en cours de journée (« Centre live »,
// Lot 4). Pour chaque équipe validée : cumul des journées déjà notées + score
// provisoire de la journée en cours (points bruts d'effectif dès qu'un match a ses
// notes), classé, comparé au dernier snapshot pour l'évolution ▲/▼.
//
// Calcul EN BLOC (pas de boucle sur getLiveGameweekScore, ~65 équipes) : 4 requêtes
// puis tout en mémoire.
//
// Le provisoire n'inclut ni le bonus « leader de journée », ni le multiplicateur de
// pronostics, ni le bonus de victoire d'un match encore en cours — comme
// getLiveGameweekScore (§24.4). C'est un aperçu, pas le classement définitif.
import { prisma } from "@/lib/db";
import { computeLineupPoints, parseScoringConfig, type LineupEntry, type BonusType } from "@/lib/scoring/engine";
import { rankTeams, rankDelta, type RankableTeam } from "./fantasy-rank";

interface SnapshotEntry {
  playerId: string;
  position: string;
  role: "STARTER" | "BENCH";
  isCaptain?: boolean;
}

export interface LiveLeaderboardRow {
  teamId: string;
  teamName: string;
  userName: string | null;
  leagueId: string;
  leagueName: string;
  jerseyConfig: unknown;
  cumulativeBefore: number; // journées déjà notées − pointsConverted
  provisionalGwPoints: number; // journée en cours (partiel)
  provisionalTotal: number;
  globalRank: number;
  leagueRank: number;
  globalDelta: number | null; // vs dernier snapshot ; + = places gagnées
}

export interface LiveFantasyLeaderboard {
  gameweekNumber: number;
  matchesWithResults: number;
  matchesTotal: number;
  updatedAt: string;
  rows: LiveLeaderboardRow[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * @param seasonId saison live active
 * @returns null si aucune journée « en cours » (pas de lineup en attente de points)
 *          ou si aucun match de cette journée n'a encore de résultat.
 */
export async function getLiveFantasyLeaderboard(seasonId: string): Promise<LiveFantasyLeaderboard | null> {
  // Journée en cours = plus grande journée non scorée qui a au moins un lineup snapshoté.
  const gw = await prisma.gameweek.findFirst({
    where: { seasonId, isScored: false, lineups: { some: {} } },
    orderBy: { number: "desc" },
    select: { id: true, number: true },
  });
  if (!gw) return null;

  const matches = await prisma.match.findMany({
    where: { gameweekId: gw.id },
    select: {
      id: true,
      homeClubId: true,
      awayClubId: true,
      homeScore: true,
      awayScore: true,
      playerStats: {
        select: { playerId: true, lnhRating: true, played: true },
      },
    },
  });
  const matchesWithResults = matches.filter((m) => m.playerStats.length > 0).length;
  if (matchesWithResults === 0) return null;

  // index : playerId → { lnhRating, played, teamWon }
  const statByPlayer = new Map<string, { lnhRating: number | null; played: boolean; teamWon: boolean }>();
  const clubWon = new Map<string, boolean>(); // clubId → a gagné un match fini de la journée
  for (const m of matches) {
    const homeWon = m.homeScore !== null && m.awayScore !== null && m.homeScore > m.awayScore;
    const awayWon = m.homeScore !== null && m.awayScore !== null && m.awayScore > m.homeScore;
    if (homeWon) clubWon.set(m.homeClubId, true);
    if (awayWon) clubWon.set(m.awayClubId, true);
  }

  const [lineups, gwPlayers, configs] = await Promise.all([
    prisma.fantasyLineup.findMany({
      where: { gameweekId: gw.id, fantasyTeam: { isValidated: true, league: { seasonId } } },
      select: {
        entries: true,
        bonus: true,
        fantasyTeam: {
          select: {
            id: true,
            name: true,
            leagueId: true,
            pointsConverted: true,
            jerseyConfig: true,
            user: { select: { name: true } },
            league: { select: { name: true } },
            lineups: {
              where: { points: { not: null }, gameweek: { number: { lt: gw.number } } },
              select: { points: true },
            },
          },
        },
      },
    }),
    prisma.player.findMany({ select: { id: true, clubId: true } }),
    prisma.gameConfig.findMany(),
  ]);

  const clubByPlayer = new Map(gwPlayers.map((p) => [p.id, p.clubId]));
  for (const m of matches) {
    for (const s of m.playerStats) {
      const clubId = clubByPlayer.get(s.playerId);
      statByPlayer.set(s.playerId, {
        lnhRating: s.lnhRating !== null ? Number(s.lnhRating) : null,
        played: s.played,
        teamWon: clubId ? clubWon.get(clubId) === true : false,
      });
    }
  }

  const scoringConfig = parseScoringConfig(Object.fromEntries(configs.map((c) => [c.key, c.value])));

  const rankable: RankableTeam[] = [];
  const meta = new Map<
    string,
    Omit<LiveLeaderboardRow, "globalRank" | "leagueRank" | "globalDelta" | "provisionalTotal">
  >();

  for (const l of lineups) {
    const team = l.fantasyTeam;
    const entries = l.entries as unknown as SnapshotEntry[];
    const inputs: LineupEntry[] = entries.map((e) => {
      const stat = statByPlayer.get(e.playerId);
      return {
        lnhRating: stat?.lnhRating ?? null,
        played: stat?.played ?? false,
        role: e.role,
        teamWon: stat?.teamWon ?? false,
        isCaptain: e.isCaptain ?? false,
        statBonusPoints: 0, // le bonus leader-de-journée ne s'applique qu'au scoring final
      };
    });
    const provisionalGw = round1(computeLineupPoints(inputs, scoringConfig, l.bonus as BonusType | null));
    const before = round1(
      team.lineups.reduce((s, x) => s + Number(x.points ?? 0), 0) - Number(team.pointsConverted),
    );
    const total = round1(before + provisionalGw);

    rankable.push({ teamId: team.id, leagueId: team.leagueId, cumulativePoints: total });
    meta.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      userName: team.user?.name ?? null,
      leagueId: team.leagueId,
      leagueName: team.league?.name ?? "",
      jerseyConfig: team.jerseyConfig,
      cumulativeBefore: before,
      provisionalGwPoints: provisionalGw,
    });
  }

  if (rankable.length === 0) return null;

  // évolution vs le dernier snapshot (journée précédente notée)
  const prevSnaps = await prisma.fantasyStandingSnapshot.findMany({
    where: { seasonId, mode: "LIVE", gameweekNumber: { lt: gw.number } },
    orderBy: { gameweekNumber: "desc" },
  });
  const prevRankByTeam = new Map<string, number>();
  const seenAt = new Set<number>();
  let latestPrevGw: number | null = null;
  for (const s of prevSnaps) {
    if (latestPrevGw === null) latestPrevGw = s.gameweekNumber;
    if (s.gameweekNumber !== latestPrevGw) break;
    prevRankByTeam.set(s.teamId, s.globalRank);
    seenAt.add(s.gameweekNumber);
  }

  const ranked = rankTeams(rankable).sort((a, b) => a.globalRank - b.globalRank);
  const rows: LiveLeaderboardRow[] = ranked.map((r) => {
    const m = meta.get(r.teamId)!;
    return {
      ...m,
      provisionalTotal: r.cumulativePoints,
      globalRank: r.globalRank,
      leagueRank: r.leagueRank,
      globalDelta: rankDelta(prevRankByTeam.get(r.teamId) ?? null, r.globalRank),
    };
  });

  return {
    gameweekNumber: gw.number,
    matchesWithResults,
    matchesTotal: matches.length,
    updatedAt: new Date().toISOString(),
    rows,
  };
}
