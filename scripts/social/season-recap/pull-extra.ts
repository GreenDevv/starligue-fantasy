/**
 * Étape 2 des données du reel « bilan après N journées » (voir generate.mjs) :
 * complète <outDir>/data.json (déjà écrit par ../fantasy-recap/pull.ts — équipe
 * type cumulée, top perfs, classement général, ligues, clubs de cœur) avec tout ce
 * qui « fait parler les données » :
 *   - starligue : buts, moyenne, plus gros écart, match le plus prolifique, victoires
 *     à domicile, classement officiel après N (+ invaincus / toujours sans victoire)
 *   - leaders LNH saison : buteurs, passeurs, gardiens (arrêts)
 *   - managers : nb d'équipes, points distribués, chouchou (le + sélectionné),
 *     capitaine préféré, pari gagnant (peu sélectionné, gros total), flop (très
 *     sélectionné, petit total), le + rentable (points / valeur de départ)
 *   - l'équipe PARFAITE : effectif de 14 (1 titulaire + 1 remplaçant par poste),
 *     budget et max par club du jeu, valeurs de départ, figé depuis J1, meilleur
 *     capitaine chaque journée — vs n°1 et manager moyen
 *   - record d'un manager sur UNE journée, plus grosse remontée au classement
 *   - pronostics : % de bons pronostics
 *
 * Usage : DATABASE_URL="<prod>" pnpm tsx scripts/social/season-recap/pull-extra.ts <lastGw> <outDir>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { computeGameweekPlayerPoints } from "@/lib/players/compute-gameweek-best-xi";
import { getStatLeaders } from "@/lib/stats/get-stat-leaders";
import { parseScoringConfig } from "@/lib/scoring/engine";
import { resolveOutcome } from "@/lib/predictions/outcome";
import { POSITIONS, type Position } from "@/lib/squad/validation";
import { computeCatchupCredit, parseCatchupConfig } from "@/lib/scoring/catchup";

const LAST_GW = Number(process.argv[2]);
const OUT_DIR = process.argv[3] ?? "";
if (!LAST_GW || !OUT_DIR) {
  console.error("usage: pull-extra.ts <lastGameweekNumber> <outDir>");
  process.exit(1);
}
const r1 = (n: number) => Math.round(n * 10) / 10;

interface Entry { playerId: string; role: "STARTER" | "BENCH"; isCaptain?: boolean }

async function main() {
  const dataPath = join(OUT_DIR, "data.json");
  const data = JSON.parse(readFileSync(dataPath, "utf8"));
  const season = await prisma.season.findFirstOrThrow({ where: { isActive: true } });
  const gameweeks = await prisma.gameweek.findMany({
    where: { seasonId: season.id, number: { lte: LAST_GW }, isScored: true },
    orderBy: { number: "asc" },
    include: { matches: { include: { homeClub: { select: { shortName: true } }, awayClub: { select: { shortName: true } } } } },
  });
  const N = gameweeks.length;
  const rawConfig = Object.fromEntries((await prisma.gameConfig.findMany()).map((c) => [c.key, c.value]));
  const scoring = parseScoringConfig(rawConfig);
  const BUDGET = Number(rawConfig.INITIAL_BUDGET ?? 140);
  const MAX_PER_CLUB = Number(rawConfig.MAX_PLAYERS_PER_CLUB ?? 3);

  // ───────────── Starligue ─────────────
  const matches = gameweeks.flatMap((g) => g.matches.map((m) => ({ ...m, gw: g.number })))
    .filter((m) => m.status === "FINISHED" && m.homeScore !== null && m.awayScore !== null);
  const goals = matches.reduce((s, m) => s + m.homeScore! + m.awayScore!, 0);
  const label = (m: (typeof matches)[number]) =>
    ({ gw: m.gw, home: m.homeClub.shortName, away: m.awayClub.shortName, homeScore: m.homeScore!, awayScore: m.awayScore! });
  const byMargin = [...matches].sort((a, b) => Math.abs(b.homeScore! - b.awayScore!) - Math.abs(a.homeScore! - a.awayScore!));
  const byGoals = [...matches].sort((a, b) => b.homeScore! + b.awayScore! - (a.homeScore! + a.awayScore!));
  const homeWins = matches.filter((m) => m.homeScore! > m.awayScore!).length;
  const draws = matches.filter((m) => m.homeScore === m.awayScore).length;
  const oneGoal = matches.filter((m) => Math.abs(m.homeScore! - m.awayScore!) === 1).length;

  const standingRows = await prisma.clubStanding.findMany({
    where: { seasonId: season.id, gameweekNumber: LAST_GW },
    orderBy: { rank: "asc" },
    include: { club: { select: { shortName: true } } },
  });
  const standing = standingRows.map((s) => ({
    rank: s.rank, club: s.club.shortName, points: s.points, played: s.played,
    wins: s.wins, draws: s.draws, losses: s.losses, goalAvg: s.goalAvg,
  }));

  const leaders = async (statKey: string) =>
    (await getStatLeaders({ statKey, scope: "season", seasonId: season.id })).leaders.slice(0, 5).map((l) => ({
      firstName: l.firstName, lastName: l.lastName, photoUrl: l.photoUrl, club: l.club.shortName, value: l.value,
    }));
  const lnhLeaders = {
    goals: await leaders("goalsTotal"),
    assists: await leaders("assists"),
    saves: await leaders("saves"),
  };

  // ───────────── Points joueurs par journée ─────────────
  const ptsByGw = new Map<number, Map<string, number>>();
  for (const g of gameweeks) ptsByGw.set(g.number, await computeGameweekPlayerPoints(g.id));
  const seasonPts = new Map<string, number>();
  for (const m of ptsByGw.values()) for (const [id, p] of m) seasonPts.set(id, r1((seasonPts.get(id) ?? 0) + p));

  // ───────────── Managers : sélections / capitaines ─────────────
  const lineups = await prisma.fantasyLineup.findMany({
    where: { gameweekId: { in: gameweeks.map((g) => g.id) }, isCatchup: false, points: { not: null } },
    select: { entries: true, points: true, gameweekId: true, fantasyTeamId: true },
  });
  const gwNumById = new Map(gameweeks.map((g) => [g.id, g.number]));
  const owned = new Map<string, number>();
  const teamsByPlayer = new Map<string, Set<string>>(); // équipes distinctes qui l'ont eu au moins une fois
  let negativeCaptains = 0; // capitaines dont la journée a coûté des points
  const captained = new Map<string, number>();
  const captainPts = new Map<string, number>(); // points « bonus capitaine » apportés
  for (const l of lineups) {
    const gwPts = ptsByGw.get(gwNumById.get(l.gameweekId)!)!;
    for (const e of l.entries as unknown as Entry[]) {
      owned.set(e.playerId, (owned.get(e.playerId) ?? 0) + 1);
      const ts = teamsByPlayer.get(e.playerId) ?? new Set<string>();
      ts.add(l.fantasyTeamId);
      teamsByPlayer.set(e.playerId, ts);
      if (e.isCaptain && (gwPts.get(e.playerId) ?? 0) < 0) negativeCaptains++;
      if (e.isCaptain) {
        captained.set(e.playerId, (captained.get(e.playerId) ?? 0) + 1);
        captainPts.set(e.playerId, r1((captainPts.get(e.playerId) ?? 0) + (gwPts.get(e.playerId) ?? 0) * (scoring.captainMultiplier - 1)));
      }
    }
  }
  const totalLineups = lineups.length;
  const ownPct = (id: string) => (totalLineups ? Math.round(((owned.get(id) ?? 0) / totalLineups) * 100) : 0);

  const players = await prisma.player.findMany({
    where: { seasonId: season.id },
    select: {
      id: true, firstName: true, lastName: true, position: true, photoUrl: true, clubId: true,
      club: { select: { shortName: true } },
      // dernière valorisation pré-saison = prix au moment de composer son effectif
      valueHistory: { where: { gameweekId: null }, orderBy: { changedAt: "desc" }, take: 1, select: { value: true } },
    },
  });
  const pById = new Map(players.map((p) => [p.id, p]));
  const initialValue = new Map(players.filter((p) => p.valueHistory[0]).map((p) => [p.id, Number(p.valueHistory[0]!.value)]));
  const gamesPlayed = new Map<string, number>();
  for (const s of await prisma.playerMatchStat.findMany({
    where: { isLive: false, played: true, match: { gameweekId: { in: gameweeks.map((g) => g.id) } } },
    select: { playerId: true },
  })) gamesPlayed.set(s.playerId, (gamesPlayed.get(s.playerId) ?? 0) + 1);

  const card = <E extends Record<string, unknown>>(id: string, extra: E = {} as E) => {
    const p = pById.get(id)!;
    return {
      playerId: id, firstName: p.firstName, lastName: p.lastName, photoUrl: p.photoUrl, club: p.club.shortName,
      position: p.position, points: seasonPts.get(id) ?? 0, ownershipPct: ownPct(id),
      initialValue: initialValue.get(id) ?? null, teams: teamsByPlayer.get(id)?.size ?? 0, ...extra,
    };
  };

  const byOwned = [...owned.entries()].sort((a, b) => b[1] - a[1]);
  const favourite = byOwned[0] ? card(byOwned[0][0], { selections: byOwned[0][1] }) : null;
  const topCaptain = [...captained.entries()].sort((a, b) => b[1] - a[1])[0];
  const captain = topCaptain ? card(topCaptain[0], { captaincies: topCaptain[1], captainBonus: captainPts.get(topCaptain[0]) ?? 0 }) : null;
  const differential = [...seasonPts.entries()]
    .filter(([id]) => ownPct(id) < 10 && (gamesPlayed.get(id) ?? 0) >= 2 && pById.has(id))
    .sort((a, b) => b[1] - a[1])[0];
  const flop = byOwned.slice(0, 15).map(([id]) => id).sort((a, b) => (seasonPts.get(a) ?? 0) - (seasonPts.get(b) ?? 0))[0];
  const value = [...seasonPts.entries()]
    .filter(([id, pts]) => initialValue.has(id) && pts > 0 && (gamesPlayed.get(id) ?? 0) >= 3)
    .map(([id, pts]) => ({ id, ratio: pts / initialValue.get(id)! }))
    .sort((a, b) => b.ratio - a.ratio)[0];

  const managerFacts = {
    teams: await prisma.fantasyTeam.count({ where: { isValidated: true, league: { seasonId: season.id } } }),
    lineups: totalLineups,
    pointsDistributed: Math.round(lineups.reduce((s, l) => s + Number(l.points), 0)),
    avgPerLineup: r1(lineups.reduce((s, l) => s + Number(l.points), 0) / Math.max(1, totalLineups)),
    favourite,
    captain,
    differential: differential ? card(differential[0]) : null,
    flop: flop ? card(flop) : null,
    bestValue: value ? card(value.id, { ptsPerM: r1(value.ratio) }) : null,
  };

  // ───────────── Record d'un manager sur une journée ─────────────
  const best = [...lineups].sort((a, b) => Number(b.points) - Number(a.points))[0];
  let gwRecord = null;
  if (best) {
    const t = await prisma.fantasyTeam.findUniqueOrThrow({
      where: { id: best.fantasyTeamId },
      select: { name: true, user: { select: { name: true } }, league: { select: { name: true } } },
    });
    const gwNum = gwNumById.get(best.gameweekId)!;
    const sameGw = lineups.filter((l) => l.gameweekId === best.gameweekId).map((l) => Number(l.points));
    const entries = best.entries as unknown as Entry[];
    const gwPts = ptsByGw.get(gwNum)!;
    const cap = entries.find((e) => e.isCaptain);
    gwRecord = {
      gameweek: gwNum, points: Number(best.points), manager: t.user?.name ?? t.name, teamName: t.name, league: t.league?.name ?? null,
      gwAverage: r1(sameGw.reduce((s, x) => s + x, 0) / sameGw.length),
      captain: cap ? card(cap.playerId, { gwPoints: gwPts.get(cap.playerId) ?? 0 }) : null,
    };
  }

  // ───────────── Plus grosse remontée au classement général ─────────────
  const snapFor = (n: number) => prisma.fantasyStandingSnapshot.findMany({ where: { seasonId: season.id, mode: "LIVE", gameweekNumber: n } });
  const [snapFirst, snapLast] = await Promise.all([snapFor(gameweeks[0]!.number), snapFor(LAST_GW)]);
  const firstRank = new Map(snapFirst.map((s) => [s.teamId, s.globalRank]));
  const climb = snapLast
    .filter((s) => firstRank.has(s.teamId))
    .map((s) => ({ s, gain: firstRank.get(s.teamId)! - s.globalRank }))
    .sort((a, b) => b.gain - a.gain)[0];
  let biggestClimber = null;
  if (climb && climb.gain > 0) {
    const t = await prisma.fantasyTeam.findUniqueOrThrow({ where: { id: climb.s.teamId }, select: { name: true, user: { select: { name: true } } } });
    biggestClimber = { manager: t.user?.name ?? t.name, from: firstRank.get(climb.s.teamId)!, to: climb.s.globalRank, gain: climb.gain, points: Number(climb.s.cumulativePoints) };
  }

  // ───────────── L'équipe parfaite (effectif figé depuis J1, règles du jeu) ─────────────
  // Par poste : 1 titulaire (×1) + 1 remplaçant (×bench). Programmation dynamique sur les
  // postes, état = coût en demi-millions : on garde les K meilleures combinaisons PAR
  // niveau de coût (sinon seules les plus chères survivent et plus rien ne tient dans le
  // budget), max par club vérifié à chaque étape ; puis meilleur capitaine de chaque
  // journée parmi les titulaires retenus.
  const candidates = new Map<Position, string[]>();
  for (const pos of POSITIONS) {
    const ids = players.filter((p) => p.position === pos && initialValue.has(p.id)).map((p) => p.id);
    ids.sort((a, b) => (seasonPts.get(b) ?? 0) - (seasonPts.get(a) ?? 0));
    const top = ids.slice(0, 14);
    const cheap = [...ids].sort((a, b) => initialValue.get(a)! - initialValue.get(b)!).slice(0, 4);
    candidates.set(pos, [...new Set([...top, ...cheap])]);
  }
  interface Beam { score: number; cost: number; clubs: Map<string, number>; picks: { pos: Position; starter: string; bench: string }[] }
  let beam: Beam[] = [{ score: 0, cost: 0, clubs: new Map(), picks: [] }];
  const PER_COST = 12;
  for (const pos of POSITIONS) {
    const ids = candidates.get(pos)!;
    const next: Beam[] = [];
    for (const b of beam) {
      for (const s of ids) for (const bn of ids) {
        if (s === bn) continue;
        const cost = b.cost + initialValue.get(s)! + initialValue.get(bn)!;
        if (cost > BUDGET + 1e-9) continue;
        const clubs = new Map(b.clubs);
        let ok = true;
        for (const id of [s, bn]) {
          const c = pById.get(id)!.clubId;
          clubs.set(c, (clubs.get(c) ?? 0) + 1);
          if (clubs.get(c)! > MAX_PER_CLUB) ok = false;
        }
        if (!ok) continue;
        const score = b.score + (seasonPts.get(s) ?? 0) + scoring.benchMultiplier * (seasonPts.get(bn) ?? 0);
        next.push({ score, cost, clubs, picks: [...b.picks, { pos, starter: s, bench: bn }] });
      }
    }
    const byCost = new Map<number, Beam[]>();
    for (const b of next) {
      const k = Math.round(b.cost * 2);
      const arr = byCost.get(k) ?? [];
      arr.push(b);
      byCost.set(k, arr);
    }
    beam = [...byCost.values()].flatMap((arr) => arr.sort((a, b) => b.score - a.score).slice(0, PER_COST));
  }
  const dream = [...beam].sort((a, b) => b.score - a.score)[0]!;
  const starters = dream.picks.map((p) => p.starter);
  const captainBonusByGw = [...ptsByGw.entries()].map(([gw, m]) => {
    const bestStarter = [...starters].sort((a, b) => (m.get(b) ?? 0) - (m.get(a) ?? 0))[0]!;
    return { gw, playerId: bestStarter, bonus: r1((m.get(bestStarter) ?? 0) * (scoring.captainMultiplier - 1)) };
  });
  const leaderRow = data.fantasy.managerStandings.rows[0];
  const dreamTeam = {
    budget: BUDGET,
    cost: r1(dream.cost),
    points: r1(dream.score + captainBonusByGw.reduce((s, c) => s + c.bonus, 0)),
    captains: captainBonusByGw.map((c) => ({ gw: c.gw, lastName: pById.get(c.playerId)!.lastName, bonus: c.bonus })),
    starters: dream.picks.map((p) => card(p.starter)),
    bench: dream.picks.map((p) => card(p.bench)),
    vsLeader: leaderRow ? { manager: leaderRow.userName ?? leaderRow.teamName, points: leaderRow.cumPoints } : null,
    vsAverage: r1(managerFacts.avgPerLineup * N),
  };

  // ───────────── Pronostics ─────────────
  const markets = await prisma.predictionMarket.findMany({
    where: { matchId: { in: matches.map((m) => m.id) } },
    select: { id: true, matchId: true, predictions: { select: { outcome: true } } },
  });
  let predTotal = 0, predOk = 0;
  for (const mk of markets) {
    const m = matches.find((x) => x.id === mk.matchId)!;
    const actual = resolveOutcome(m.homeScore!, m.awayScore!);
    for (const p of mk.predictions) { predTotal++; if (p.outcome === actual) predOk++; }
  }

  // ───────────── Top joueurs (points fantasy cumulés) ─────────────
  const topPlayers = [...seasonPts.entries()]
    .filter(([id]) => pById.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => card(id, { games: gamesPlayed.get(id) ?? 0 }));

  // ───────────── Faits « flash » ─────────────
  const stats = await prisma.playerMatchStat.findMany({
    where: { isLive: false, match: { gameweekId: { in: gameweeks.map((g) => g.id) }, status: "FINISHED" } },
    select: {
      playerId: true, goalsTotal: true, shotsTotal: true, goalsPenalty: true, shotsPenalty: true, saves: true,
      twoMinTaken: true, disqualified: true, assists: true,
      match: { select: { homeClubId: true, awayClubId: true, homeClub: { select: { shortName: true } }, awayClub: { select: { shortName: true } }, gameweek: { select: { number: true } } } },
    },
  });
  const sum = (f: (x: (typeof stats)[number]) => number | null) => stats.reduce((a, x) => a + (f(x) ?? 0), 0);
  const bestGoals = [...stats].sort((a, b) => (b.goalsTotal ?? 0) - (a.goalsTotal ?? 0))[0];
  const shooterTotals = new Map<string, { g: number; s: number }>();
  for (const x of stats) {
    if (x.shotsTotal == null) continue;
    const t = shooterTotals.get(x.playerId) ?? { g: 0, s: 0 };
    t.g += x.goalsTotal ?? 0; t.s += x.shotsTotal; shooterTotals.set(x.playerId, t);
  }
  const sniper = [...shooterTotals.entries()].filter(([, t]) => t.s >= 25).sort((a, b) => b[1].g / b[1].s - a[1].g / a[1].s)[0];
  const worstLineup = Math.min(...lineups.map((l) => Number(l.points)));
  const bgPlayer = bestGoals ? pById.get(bestGoals.playerId) : null;
  const flash = {
    secondsPerGoal: Math.round((matches.length * 60 * 60) / Math.max(1, goals)),
    saves: sum((x) => x.saves),
    assists: sum((x) => x.assists),
    penalties: { scored: sum((x) => x.goalsPenalty), attempted: sum((x) => x.shotsPenalty) },
    twoMin: sum((x) => x.twoMinTaken),
    redCards: sum((x) => x.disqualified),
    mostGoalsInMatch: bestGoals && bgPlayer ? {
      ...card(bestGoals.playerId), goals: bestGoals.goalsTotal, shots: bestGoals.shotsTotal, gw: bestGoals.match.gameweek.number,
      opponent: bgPlayer.clubId === bestGoals.match.homeClubId ? bestGoals.match.awayClub.shortName : bestGoals.match.homeClub.shortName,
    } : null,
    sniper: sniper ? { ...card(sniper[0]), goals: sniper[1].g, shots: sniper[1].s, pct: Math.round((sniper[1].g / sniper[1].s) * 100) } : null,
    worstLineup: r1(worstLineup),
    negativeCaptains,
    captaincies: totalLineups,
  };

  // ───────────── Rejoins-nous : points d'accueil d'un manager qui s'inscrit maintenant ─────────────
  // Même calcul que recomputeCatchupCredits (§13.7) : par journée notée manquée,
  // médiane des vrais scores × CATCHUP_FACTOR. Rang = où ce total le placerait au
  // classement général actuel.
  const catchupConfig = parseCatchupConfig(rawConfig);
  const creditsByGw = gameweeks.map((g) => {
    const real = lineups.filter((l) => l.gameweekId === g.id).map((l) => Number(l.points));
    return { gw: g.number, credit: real.length && catchupConfig.enabled ? computeCatchupCredit(real, catchupConfig) : 0 };
  });
  const joinTotal = r1(creditsByGw.reduce((a, c) => a + c.credit, 0));
  const lastSnap = await prisma.fantasyStandingSnapshot.findMany({ where: { seasonId: season.id, mode: "LIVE", gameweekNumber: LAST_GW }, select: { cumulativePoints: true } });
  const nextGw = await prisma.gameweek.findFirst({ where: { seasonId: season.id, number: LAST_GW + 1 }, select: { number: true, deadlineAt: true } });
  const joinOffer = {
    total: joinTotal,
    perGameweek: creditsByGw,
    factorPct: Math.round(catchupConfig.factor * 100),
    rank: lastSnap.filter((x) => Number(x.cumulativePoints) > joinTotal).length + 1,
    teams: lastSnap.length + 1,
    ahead: lastSnap.filter((x) => Number(x.cumulativePoints) < joinTotal).length,
    nextGameweek: nextGw ? { number: nextGw.number, deadlineAt: nextGw.deadlineAt?.toISOString() ?? null } : null,
  };

  data.recap = {
    gameweeks: N,
    starligue: {
      matches: matches.length, goals, goalsPerMatch: r1(goals / Math.max(1, matches.length)),
      homeWinPct: Math.round((homeWins / Math.max(1, matches.length)) * 100), draws, oneGoalGames: oneGoal,
      biggestWin: byMargin[0] ? label(byMargin[0]) : null,
      highestScoring: byGoals[0] ? label(byGoals[0]) : null,
      standing,
      unbeaten: standing.filter((s) => s.losses === 0 && s.draws === 0 && s.played > 0).map((s) => s.club),
      winless: standing.filter((s) => s.wins === 0 && s.played > 0).map((s) => s.club),
    },
    lnhLeaders,
    managers: managerFacts,
    gwRecord,
    biggestClimber,
    dreamTeam,
    predictions: { total: predTotal, correct: predOk, pct: predTotal ? Math.round((predOk / predTotal) * 100) : null },
    // % d'équipes alignées (toutes journées) qui avaient chaque joueur de l'équipe type cumulée
    topPlayers,
    flash,
    join: joinOffer,
    bestXITeams: Object.fromEntries(
      (data.fantasy.bestXICombined as { playerId: string }[]).map((e) => [e.playerId, teamsByPlayer.get(e.playerId)?.size ?? 0])
    ),
    bestXIOwnershipPct: Object.fromEntries(
      (data.fantasy.bestXICombined as { playerId: string }[]).map((e) => [e.playerId, ownPct(e.playerId)])
    ),
  };
  writeFileSync(dataPath, JSON.stringify(data, null, 2));

  const nm = (c: { lastName: string } | null) => c?.lastName ?? "-";
  console.log(JSON.stringify({
    starligue: `${matches.length} matchs, ${goals} buts (${data.recap.starligue.goalsPerMatch}/m), dom ${data.recap.starligue.homeWinPct}%, nuls ${draws}, à 1 but ${oneGoal}`,
    biggestWin: data.recap.starligue.biggestWin, highestScoring: data.recap.starligue.highestScoring,
    unbeaten: data.recap.starligue.unbeaten, winless: data.recap.starligue.winless,
    lnh: Object.fromEntries(Object.entries(lnhLeaders).map(([k, v]) => [k, v.map((l) => `${l.lastName} ${l.value}`)])),
    managers: {
      teams: managerFacts.teams, lineups: totalLineups, distributed: managerFacts.pointsDistributed, avg: managerFacts.avgPerLineup,
      favourite: `${nm(favourite)} ${favourite?.ownershipPct}% → ${favourite?.points} pts`,
      captain: `${nm(captain)} ×${captain?.captaincies} (+${captain?.captainBonus})`,
      differential: `${nm(managerFacts.differential)} ${managerFacts.differential?.ownershipPct}% → ${managerFacts.differential?.points}`,
      flop: `${nm(managerFacts.flop)} ${managerFacts.flop?.ownershipPct}% → ${managerFacts.flop?.points}`,
      bestValue: `${nm(managerFacts.bestValue)} ${managerFacts.bestValue?.initialValue}M → ${managerFacts.bestValue?.points} (${managerFacts.bestValue?.ptsPerM}/M)`,
    },
    gwRecord: gwRecord && `J${gwRecord.gameweek} ${gwRecord.manager} ${gwRecord.points} (moy ${gwRecord.gwAverage}) cap ${nm(gwRecord.captain)}`,
    biggestClimber,
    dreamTeam: `${dreamTeam.points} pts, ${dreamTeam.cost}/${BUDGET} M — ${dreamTeam.starters.map((s) => `${s.position}:${s.lastName}(${s.initialValue})`).join(" ")} | banc ${dreamTeam.bench.map((s) => s.lastName).join(",")} | vs n°1 ${dreamTeam.vsLeader?.points}, moyen ${dreamTeam.vsAverage}`,
    predictions: data.recap.predictions,
  }, null, 2));
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
