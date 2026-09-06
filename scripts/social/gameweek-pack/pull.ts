/**
 * Étape 1 du pack de contenu par journée (voir generate.mjs).
 * Dump toutes les données d'une journée notée (saison live) → <outDir>/data.json :
 *   - les 8 scores + le classement Starligue de la journée (ClubStanding)
 *   - top buteurs / passeurs / gardiens de la journée (getStatLeaders scope=gameweek)
 *   - équipe type + top 5 perfs (mêmes fonctions que generate-weekly-news)
 *   - top 3 du classement général fantasy + moyenne de points de la journée
 *   - clubs de cœur (classement des clubs d'origine des managers)
 *
 * Usage :
 *   DATABASE_URL="<prod>" pnpm tsx scripts/social/gameweek-pack/pull.ts <gameweekNumber> <outDir>
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { getStatLeaders } from "@/lib/stats/get-stat-leaders";
import { computeGameweekBestXI, computeGameweekPlayerPoints } from "@/lib/players/compute-gameweek-best-xi";
import { computeBestPerformances } from "@/lib/players/compute-best-performances";
import { getClubFantasyRanking } from "@/lib/community/club-fantasy-ranking";

const GW = Number(process.argv[2]);
const OUT_DIR = process.argv[3] ?? "";
if (!GW || !OUT_DIR) {
  console.error("usage: pull.ts <gameweekNumber> <outDir>");
  process.exit(1);
}
if (/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) {
  console.error("⚠️  DATABASE_URL pointe sur une base locale — le pack a besoin de la prod.");
  process.exit(1);
}

async function main() {
  const season = await prisma.season.findFirstOrThrow({ where: { isActive: true } });
  const gameweek = await prisma.gameweek.findUniqueOrThrow({
    where: { seasonId_number: { seasonId: season.id, number: GW } },
  });

  // 1. Scores
  const matches = await prisma.match.findMany({
    where: { gameweekId: gameweek.id },
    orderBy: { kickoffAt: "asc" },
    include: {
      homeClub: { select: { name: true, shortName: true, logoUrl: true } },
      awayClub: { select: { name: true, shortName: true, logoUrl: true } },
    },
  });

  // 2. Classement Starligue J1
  const standing = await prisma.clubStanding.findMany({
    where: { seasonId: season.id, gameweekNumber: GW },
    orderBy: { rank: "asc" },
    include: { club: { select: { name: true, shortName: true, logoUrl: true } } },
  });

  // 3. Stat leaders (journée)
  const [scorers, passers, keepers] = await Promise.all([
    getStatLeaders({ statKey: "goalsTotal", scope: "gameweek", seasonId: season.id, gameweekNumber: GW }),
    getStatLeaders({ statKey: "assists", scope: "gameweek", seasonId: season.id, gameweekNumber: GW }),
    getStatLeaders({ statKey: "saves", scope: "gameweek", seasonId: season.id, gameweekNumber: GW }),
  ]);

  // 4. Fantasy : équipe type + top perfs
  const [bestXI, bestPerf] = await Promise.all([
    computeGameweekBestXI(gameweek.id),
    computeBestPerformances(gameweek.id, 5),
  ]);

  // enrichir bestPerf avec identité joueur
  const perfPlayers = await prisma.player.findMany({
    where: { id: { in: bestPerf.map((p) => p.playerId) } },
    select: {
      id: true, firstName: true, lastName: true, position: true, photoUrl: true,
      club: { select: { shortName: true, logoUrl: true } },
    },
  });
  const perfById = new Map(perfPlayers.map((p) => [p.id, p]));
  const performances = bestPerf.map((p) => ({ ...p, player: perfById.get(p.playerId) ?? null }));

  // 5. Classement général fantasy (top 3) + moyenne de points de la journée
  const lineups = await prisma.fantasyLineup.findMany({
    where: { gameweekId: gameweek.id, points: { not: null } },
    orderBy: { points: "desc" },
    include: {
      fantasyTeam: {
        select: {
          name: true, totalPoints: true,
          user: { select: { name: true } },
          league: { select: { name: true } },
        },
      },
    },
  });
  const pts = lineups.map((l) => Number(l.points));
  const avgGwPoints = pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : 0;
  const medianGwPoints = pts.length
    ? ([...pts].sort((a, b) => a - b)[Math.floor(pts.length / 2)] ?? 0)
    : 0;

  const topFantasy = lineups.slice(0, 5).map((l, i) => ({
    rank: i + 1,
    gwPoints: Number(l.points),
    rawPoints: l.rawPoints !== null ? Number(l.rawPoints) : null,
    predictionMultiplier: l.predictionMultiplier !== null ? Number(l.predictionMultiplier) : null,
    teamName: l.fantasyTeam.name,
    userName: l.fantasyTeam.user?.name ?? null,
    leagueName: l.fantasyTeam.league?.name ?? null,
    totalPoints: Number(l.fantasyTeam.totalPoints),
  }));

  // 6. Meilleur club de la journée = rang 1 du classement J1
  const bestClub = standing[0]
    ? {
        name: standing[0].club.name,
        shortName: standing[0].club.shortName,
        logoUrl: standing[0].club.logoUrl,
        points: standing[0].points,
        goalAvg: standing[0].goalAvg,
        goalsFor: standing[0].goalsFor,
        goalsAgainst: standing[0].goalsAgainst,
      }
    : null;

  // 7. « Club de cœur » = club Starligue dont les joueurs ont cumulé le plus de
  //    points fantasy sur la journée (titulaire, hors capitaine — même hypothèse
  //    que l'équipe type / les meilleures perfs).
  const gwPlayerPoints = await computeGameweekPlayerPoints(gameweek.id);
  const allPlayers = await prisma.player.findMany({
    where: { id: { in: [...gwPlayerPoints.keys()] } },
    select: { id: true, clubId: true, club: { select: { name: true, shortName: true, logoUrl: true } } },
  });
  const clubAgg = new Map<string, { name: string; shortName: string; logoUrl: string | null; points: number; players: number }>();
  for (const p of allPlayers) {
    const pts = gwPlayerPoints.get(p.id) ?? 0;
    const cur = clubAgg.get(p.clubId) ?? { name: p.club.name, shortName: p.club.shortName, logoUrl: p.club.logoUrl, points: 0, players: 0 };
    cur.points += pts;
    cur.players += 1;
    clubAgg.set(p.clubId, cur);
  }
  const clubFantasyRanking = [...clubAgg.values()]
    .map((c) => ({ ...c, points: Math.round(c.points * 10) / 10 }))
    .sort((a, b) => b.points - a.points);
  const heartClub = clubFantasyRanking[0] ?? null;

  // 8. « Clubs de cœur » = classement des clubs d'origine des managers par points
  //    fantasy cumulés (widget dashboard « Classement des clubs ») — top 3 pour le reel.
  const homeClubRanking = (await getClubFantasyRanking({ seasonId: season.id, mode: "live" }))
    .slice(0, 5)
    .map((r) => ({
      rank: r.rank,
      name: r.clubName,
      city: r.clubCity,
      country: r.clubCountry,
      logoUrl: r.clubLogoUrl,
      managers: r.managers,
      points: Math.round(r.points * 10) / 10,
    }));

  const data = {
    generatedAt: new Date().toISOString(),
    season: season.label,
    seasonId: season.id,
    gameweek: { number: GW, id: gameweek.id, deadlineAt: gameweek.deadlineAt.toISOString() },
    matches: matches.map((m) => ({
      kickoffAt: m.kickoffAt.toISOString(),
      status: m.status,
      home: { ...m.homeClub, score: m.homeScore },
      away: { ...m.awayClub, score: m.awayScore },
    })),
    standing: standing.map((s) => ({
      rank: s.rank, clubName: s.club.name, clubShortName: s.club.shortName, logoUrl: s.club.logoUrl,
      played: s.played, wins: s.wins, draws: s.draws, losses: s.losses,
      goalsFor: s.goalsFor, goalsAgainst: s.goalsAgainst, goalAvg: s.goalAvg, points: s.points,
    })),
    statLeaders: { scorers, passers, keepers },
    fantasy: {
      bestXI,
      performances,
      topFantasy,
      lineupCount: pts.length,
      avgGwPoints: Math.round(avgGwPoints * 10) / 10,
      medianGwPoints: Math.round(medianGwPoints * 10) / 10,
      maxGwPoints: pts.length ? Math.max(...pts) : 0,
      minGwPoints: pts.length ? Math.min(...pts) : 0,
    },
    bestClub,
    heartClub,
    clubFantasyRanking: clubFantasyRanking.slice(0, 5),
    homeClubRanking,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, "data.json");
  writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log("→", outPath);
  console.log(JSON.stringify({
    gameweek: GW,
    matches: data.matches.length,
    finished: data.matches.filter((m) => m.status === "FINISHED").length,
    standingRows: data.standing.length,
    scorers: scorers.leaders.slice(0, 3).map((l) => `${l.lastName} ${l.value}`),
    passers: passers.leaders.slice(0, 3).map((l) => `${l.lastName} ${l.value}`),
    keepers: keepers.leaders.slice(0, 3).map((l) => `${l.lastName} ${l.value}`),
    bestXI: bestXI.map((e) => `${e.position}:${e.lastName} ${e.points}`),
    topFantasy: topFantasy.map((t) => `${t.rank}.${t.userName ?? t.teamName} ${t.gwPoints}`),
    avgGwPoints: data.fantasy.avgGwPoints,
    lineupCount: data.fantasy.lineupCount,
    bestClub: bestClub?.shortName,
    heartClub: heartClub ? `${heartClub.shortName} ${heartClub.points}` : null,
  }, null, 2));
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
