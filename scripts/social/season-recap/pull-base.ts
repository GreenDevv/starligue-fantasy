/**
 * Copie versionnée de scripts/social/fantasy-recap/pull.ts (typée strict) pour que le
 * reel « bilan » (season-recap) tourne en CI sans dépendre d'un script non versionné.
 *
 * Étape 1 du reel « bilan fantasy » (voir generate.mjs) : dump les données fantasy
 * cumulées de la saison live jusqu'à une journée donnée → <outDir>/data.json.
 * Contrairement à gameweek-pack/pull.ts (une seule journée), ce script regarde
 * TOUTES les journées notées 1..N pour produire :
 *   - l'équipe type de la dernière journée ET l'équipe type cumulée 1..N
 *   - le top 10 des meilleures perfs individuelles sur 1..N (avec journée + match)
 *   - pour chaque joueur cité : combien de managers l'avaient (dont en capitaine)
 *     cette journée-là (FantasyLineup.entries)
 *   - le classement général qui évolue (rang à J1 → rang à N, moyenne pts/journée)
 *     depuis FantasyStandingSnapshot (mode LIVE)
 *   - la meilleure ligue (moyenne de points par équipe, ligues ≥3 équipes)
 *   - le top 5 des clubs de cœur (classement existant club-fantasy-ranking) + lat/lon
 *
 * Usage :
 *   DATABASE_URL="<prod>" pnpm tsx scripts/social/season-recap/pull-base.ts <lastGameweekNumber> <outDir>
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { computeGameweekBestXI, computeGameweekPlayerPoints } from "@/lib/players/compute-gameweek-best-xi";
import { computeBestXI } from "@/lib/players/compute-best-xi";
import { computeBestPerformances } from "@/lib/players/compute-best-performances";
import { getClubFantasyRanking } from "@/lib/community/club-fantasy-ranking";
import { parseScoringConfig } from "@/lib/scoring/engine";

const LAST_GW = Number(process.argv[2]);
const OUT_DIR = process.argv[3] ?? "";
if (!LAST_GW || !OUT_DIR) {
  console.error("usage: pull.ts <lastGameweekNumber> <outDir>");
  process.exit(1);
}
if (/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) {
  console.error("⚠️  DATABASE_URL pointe sur une base locale — ce reel a besoin de la prod.");
  process.exit(1);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Compte, pour un ensemble de joueurs et UNE journée, combien de FantasyLineup les
 * incluent (et combien en capitaine). Lit `entries` (JSON) telle qu'écrite par
 * snapshotGameweekLineups. */
async function countOwnership(
  gameweekId: string,
  playerIds: string[]
): Promise<Map<string, { count: number; captains: number }>> {
  const wanted = new Set(playerIds);
  const lineups = await prisma.fantasyLineup.findMany({
    where: { gameweekId, isCatchup: false },
    select: { entries: true },
  });
  const result = new Map<string, { count: number; captains: number }>();
  for (const l of lineups) {
    const entries = l.entries as unknown as { playerId: string; isCaptain?: boolean }[];
    for (const e of entries) {
      if (!wanted.has(e.playerId)) continue;
      const cur = result.get(e.playerId) ?? { count: 0, captains: 0 };
      cur.count += 1;
      if (e.isCaptain) cur.captains += 1;
      result.set(e.playerId, cur);
    }
  }
  return result;
}

async function main() {
  const season = await prisma.season.findFirstOrThrow({ where: { isActive: true } });
  const gameweeks = await prisma.gameweek.findMany({
    where: { seasonId: season.id, number: { lte: LAST_GW }, isScored: true },
    orderBy: { number: "asc" },
  });
  if (gameweeks.length === 0) throw new Error("Aucune journée notée dans cette plage");
  const firstGwNumber = gameweeks[0]!.number;
  const lastGw = gameweeks[gameweeks.length - 1]!;
  if (lastGw.number !== LAST_GW) {
    console.warn(`⚠️  J${LAST_GW} pas encore notée — dernière journée notée : J${lastGw.number}`);
  }
  const effectiveLastGw = lastGw.number;

  // ---- lineups totaux (pour les %) ----
  const lineupCountByGw = new Map<number, number>();
  for (const gw of gameweeks) {
    lineupCountByGw.set(
      gw.number,
      await prisma.fantasyLineup.count({ where: { gameweekId: gw.id, points: { not: null } } })
    );
  }

  // ---- 1. équipe type de la dernière journée + équipe type cumulée ----
  const [bestXILast, bestXICombined] = await Promise.all([
    computeGameweekBestXI(lastGw.id),
    computeBestXI(season.id),
  ]);
  const ownershipLast = await countOwnership(
    lastGw.id,
    [...bestXILast, ...bestXICombined].map((e) => e.playerId)
  );
  const withOwnership = (entries: typeof bestXILast) =>
    entries.map((e) => {
      const o = ownershipLast.get(e.playerId) ?? { count: 0, captains: 0 };
      const total = lineupCountByGw.get(effectiveLastGw) ?? 0;
      return { ...e, ownership: { ...o, total, pct: total ? Math.round((o.count / total) * 100) : 0 } };
    });

  // ---- 2. top 10 perfs combinées sur toutes les journées, avec journée + match ----
  const perGwPerf = await Promise.all(
    gameweeks.map(async (gw) => ({
      gw,
      perf: await computeBestPerformances(gw.id, 15),
    }))
  );
  const flatPerf = perGwPerf.flatMap(({ gw, perf }) => perf.map((p) => ({ ...p, gwNumber: gw.number, gwId: gw.id })));
  flatPerf.sort((a, b) => b.points - a.points || a.playerId.localeCompare(b.playerId));
  const top10Raw = flatPerf.slice(0, 10);

  const perfPlayers = await prisma.player.findMany({
    where: { id: { in: top10Raw.map((p) => p.playerId) } },
    select: {
      id: true, firstName: true, lastName: true, position: true, photoUrl: true, clubId: true,
      club: { select: { shortName: true, logoUrl: true } },
    },
  });
  const perfById = new Map(perfPlayers.map((p) => [p.id, p]));
  const perfStats = await prisma.playerMatchStat.findMany({
    where: { playerId: { in: top10Raw.map((p) => p.playerId) }, match: { gameweekId: { in: gameweeks.map((g) => g.id) } } },
    select: {
      playerId: true, matchId: true, goalsTotal: true, shotsTotal: true, assists: true,
      saves: true, shotsFaced: true, savePercentage: true, ballsRecovered: true,
      match: {
        select: {
          gameweekId: true, homeClubId: true, awayClubId: true, homeScore: true, awayScore: true,
          homeClub: { select: { shortName: true } },
          awayClub: { select: { shortName: true } },
        },
      },
    },
  });
  const statByPlayerGw = new Map(perfStats.map((s) => [`${s.playerId}|${s.match.gameweekId}`, s]));

  // ownership top10 : une requête par journée concernée (au plus LAST_GW)
  const ownershipByGw = new Map<string, Map<string, { count: number; captains: number }>>();
  for (const gwId of new Set(top10Raw.map((p) => p.gwId))) {
    const ids = top10Raw.filter((p) => p.gwId === gwId).map((p) => p.playerId);
    ownershipByGw.set(gwId, await countOwnership(gwId, ids));
  }

  const topPerformances = top10Raw.map((p, i) => {
    const player = perfById.get(p.playerId) ?? null;
    const s = statByPlayerGw.get(`${p.playerId}|${p.gwId}`);
    const own = ownershipByGw.get(p.gwId)?.get(p.playerId) ?? { count: 0, captains: 0 };
    const total = lineupCountByGw.get(p.gwNumber) ?? 0;
    let opponent: string | null = null;
    let ownScore: number | null = null;
    let oppScore: number | null = null;
    let isHome: boolean | null = null;
    if (s && player) {
      isHome = s.match.homeClubId === player.clubId;
      opponent = isHome ? s.match.awayClub.shortName : s.match.homeClub.shortName;
      ownScore = isHome ? s.match.homeScore : s.match.awayScore;
      oppScore = isHome ? s.match.awayScore : s.match.homeScore;
    }
    return {
      rank: i + 1,
      playerId: p.playerId,
      points: p.points,
      lnhRating: p.lnhRating,
      gameweekNumber: p.gwNumber,
      player,
      stat: s
        ? {
            goalsTotal: s.goalsTotal, shotsTotal: s.shotsTotal, assists: s.assists,
            saves: s.saves, shotsFaced: s.shotsFaced,
            savePercentage: s.savePercentage !== null ? Number(s.savePercentage) : null,
            ballsRecovered: s.ballsRecovered,
          }
        : null,
      match: opponent ? { opponent, isHome, ownScore, oppScore } : null,
      ownership: { ...own, total, pct: total ? Math.round((own.count / total) * 100) : 0 },
    };
  });

  // ---- 3. classement général qui évolue (J{first} → J{last}) ----
  const [snapFirst, snapLast] = await Promise.all([
    prisma.fantasyStandingSnapshot.findMany({
      where: { seasonId: season.id, mode: "LIVE", gameweekNumber: firstGwNumber },
      select: { teamId: true, globalRank: true },
    }),
    prisma.fantasyStandingSnapshot.findMany({
      where: { seasonId: season.id, mode: "LIVE", gameweekNumber: effectiveLastGw },
      orderBy: { globalRank: "asc" },
    }),
  ]);
  // FantasyStandingSnapshot.teamId n'est pas une relation Prisma (LIVE → FantasyTeam,
  // SIMULATION → SimulationTeam) : on rejoint à la main.
  const teamsById = new Map(
    (
      await prisma.fantasyTeam.findMany({
        where: { id: { in: snapLast.map((s) => s.teamId) } },
        select: { id: true, name: true, user: { select: { name: true } }, league: { select: { name: true } } },
      })
    ).map((t) => [t.id, t])
  );
  const rankBeforeByTeam = new Map(snapFirst.map((s) => [s.teamId, s.globalRank]));
  const TOP_MANAGERS = 8;
  const managerStandings = {
    totalTeams: snapLast.length,
    rows: snapLast.slice(0, TOP_MANAGERS).map((s) => {
      const t = teamsById.get(s.teamId);
      return {
        teamId: s.teamId,
        teamName: t?.name ?? "?",
        userName: t?.user?.name ?? null,
        leagueName: t?.league?.name ?? null,
        rankBefore: rankBeforeByTeam.get(s.teamId) ?? null,
        rankAfter: s.globalRank,
        cumPoints: Number(s.cumulativePoints),
        avgPerGw: round1(Number(s.cumulativePoints) / effectiveLastGw),
      };
    }),
  };

  // ---- 3bis. impact global : quels joueurs ont le plus rapporté à L'ENSEMBLE des
  // managers (Σ points, titulaires uniquement, capitaine compté ×captainMultiplier)
  // + d'où viennent les points du manager n°1 (même calcul, restreint à son équipe).
  // Approximation délibérée (comme le reste de ce script) : on réutilise le total
  // "titulaire non-capitaine" déjà calculé par computeGameweekPlayerPoints et on
  // applique juste le multiplicateur capitaine — pas de recalcul du moteur complet
  // (teamWon/bonus déjà inclus dans ce total).
  const configs = await prisma.gameConfig.findMany();
  const scoringConfig = parseScoringConfig(Object.fromEntries(configs.map((c) => [c.key, c.value])));
  const topTeamId = managerStandings.rows[0]?.teamId ?? null;

  const topTeamBreakdown = new Map<string, number>();
  for (const gw of gameweeks) {
    if (!topTeamId) break;
    const totals = await computeGameweekPlayerPoints(gw.id);
    const lineup = await prisma.fantasyLineup.findUnique({
      where: { fantasyTeamId_gameweekId: { fantasyTeamId: topTeamId, gameweekId: gw.id } },
      select: { entries: true },
    });
    if (!lineup) continue;
    const entries = lineup.entries as unknown as { playerId: string; role: "STARTER" | "BENCH"; isCaptain?: boolean }[];
    for (const e of entries) {
      if (e.role !== "STARTER") continue;
      const base = totals.get(e.playerId) ?? 0;
      const contribution = round1(base * (e.isCaptain ? scoringConfig.captainMultiplier : 1));
      topTeamBreakdown.set(e.playerId, round1((topTeamBreakdown.get(e.playerId) ?? 0) + contribution));
    }
  }

  const topTeamBreakdownRaw = [...topTeamBreakdown.entries()]
    .map(([playerId, points]) => ({ playerId, points }))
    .sort((a, b) => b.points - a.points);
  const breakdownPlayers = await prisma.player.findMany({
    where: { id: { in: topTeamBreakdownRaw.map((p) => p.playerId) } },
    select: { id: true, firstName: true, lastName: true, photoUrl: true, club: { select: { shortName: true, logoUrl: true } } },
  });
  const breakdownById = new Map(breakdownPlayers.map((p) => [p.id, p]));
  const topManagerBreakdown = {
    teamId: topTeamId,
    managerName: managerStandings.rows[0]?.userName ?? managerStandings.rows[0]?.teamName ?? null,
    totalPoints: managerStandings.rows[0]?.cumPoints ?? 0,
    players: topTeamBreakdownRaw.map((p) => ({ ...p, player: breakdownById.get(p.playerId) ?? null })),
  };

  // ---- 4. meilleure ligue (moyenne de points/équipe, ligues ≥3 équipes) ----
  const leagueSnaps = await prisma.fantasyStandingSnapshot.findMany({
    where: { seasonId: season.id, mode: "LIVE", gameweekNumber: effectiveLastGw },
    select: { leagueId: true, cumulativePoints: true },
  });
  const leagueNameById = new Map(
    (await prisma.league.findMany({ where: { id: { in: leagueSnaps.map((s) => s.leagueId) } }, select: { id: true, name: true } })).map(
      (l) => [l.id, l.name]
    )
  );
  const byLeague = new Map<string, { name: string; sum: number; n: number }>();
  for (const s of leagueSnaps) {
    const cur = byLeague.get(s.leagueId) ?? { name: leagueNameById.get(s.leagueId) ?? "?", sum: 0, n: 0 };
    cur.sum += Number(s.cumulativePoints);
    cur.n += 1;
    byLeague.set(s.leagueId, cur);
  }
  const bestLeagues = [...byLeague.entries()]
    .map(([leagueId, v]) => ({ leagueId, name: v.name, teamCount: v.n, avgPoints: round1(v.sum / v.n) }))
    .filter((l) => l.teamCount >= 3)
    .sort((a, b) => b.avgPoints - a.avgPoints)
    .slice(0, 3)
    .map((l, i) => ({ rank: i + 1, ...l }));

  // ---- 5. top 5 clubs de cœur + géoloc pour la carte ----
  const heartTop5 = (await getClubFantasyRanking({ seasonId: season.id, mode: "live" })).slice(0, 5);
  const heartClubIds = heartTop5.map((c) => c.clubId);
  const heartGeo = await prisma.handballClub.findMany({
    where: { id: { in: heartClubIds } },
    select: { id: true, latitude: true, longitude: true },
  });
  const geoById = new Map(heartGeo.map((c) => [c.id, c]));
  const heartClubsTop5 = heartTop5.map((c) => {
    const g = geoById.get(c.clubId);
    return {
      rank: c.rank, clubId: c.clubId, name: c.clubName, city: c.clubCity, country: c.clubCountry,
      logoUrl: c.clubLogoUrl, managers: c.managers, points: round1(c.points),
      lat: g?.latitude ?? null, lon: g?.longitude ?? null,
    };
  });

  const data = {
    generatedAt: new Date().toISOString(),
    season: season.label,
    seasonId: season.id,
    firstGameweekNumber: firstGwNumber,
    lastGameweekNumber: effectiveLastGw,
    fantasy: {
      bestXILast: withOwnership(bestXILast),
      bestXICombined: withOwnership(bestXICombined),
      topPerformances,
      managerStandings,
      topManagerBreakdown,
      bestLeagues,
      heartClubsTop5,
    },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, "data.json");
  writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log("→", outPath);
  console.log(JSON.stringify({
    range: `J${firstGwNumber}→J${effectiveLastGw}`,
    bestXILast: data.fantasy.bestXILast.map((e) => `${e.position}:${e.lastName} ${e.points} (${e.ownership.pct}%)`),
    bestXICombined: data.fantasy.bestXICombined.map((e) => `${e.position}:${e.lastName} ${e.points}`),
    top10: topPerformances.map((p) => `J${p.gameweekNumber} ${p.player?.lastName} ${p.points} · ${p.ownership.count} mgrs`),
    managerStandings: managerStandings.rows.map((r) => `${r.rankBefore ?? "-"}→${r.rankAfter} ${r.userName ?? r.teamName} ${r.cumPoints}`),
    topManagerBreakdown: `${topManagerBreakdown.managerName} ${topManagerBreakdown.totalPoints} → ` + topManagerBreakdown.players.map((p) => `${p.player?.lastName} ${p.points}`).join(", "),
    bestLeagues: bestLeagues.map((l) => `${l.name} ${l.avgPoints} (${l.teamCount} éq.)`),
    heartClubsTop5: heartClubsTop5.map((c) => `${c.rank}. ${c.name} ${c.points} [${c.lat},${c.lon}]`),
  }, null, 2));
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
