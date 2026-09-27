// Audit LECTURE SEULE des journées de la saison active — rien n'est écrit.
//
//   pnpm tsx scripts/audit-gameweeks.ts [--from=1] [--to=4]
//   (base = DATABASE_URL de l'env ; prod : URL publique Railway + ?sslmode=require)
//
// Vérifie, journée par journée :
//  A. Matchs     : statut + score en base == calendrier lnh.fr.
//  B. Notes      : boxscore lnh.fr re-scrapé == PlayerMatchStat définitifs (tous les
//                  champs corrigeables), lignes lnh.fr non rapprochées, stats orphelines
//                  (en base, absentes de lnh.fr), joueur hors des 2 clubs du match,
//                  notes provisoires (isLive) restées sur un match fini.
//  C. Points     : chaque FantasyLineup recalculé indépendamment (mêmes fonctions pures
//                  que computeGameweekScores : note × rôle/capitaine/bonus, leaders de
//                  journée, multiplicateur pronostics) == points/rawPoints/multiplicateur
//                  stockés ; journée notée ⇔ tous les alignements ont des points.
//  D. Accueil    : lignes isCatchup == médiane réelle × facteur, sur les bonnes journées.
//  E. Totaux     : FantasyTeam.totalPoints == Σ points − pointsConverted ; snapshots de
//                  classement (cumul + rangs) == recalcul.
//  F. Alignements: 1 capitaine max, pas de doublon, joueurs existants, garde validatedAt.
//  G. Valeurs    : au plus 1 PlayerValueHistory par (joueur, journée).
//  H. Joueurs    : slug lnh.fr manquant/dupliqué.
import { PrismaClient } from "@prisma/client";
import { createLnhScraperProvider, boxscoreRowToStatFields } from "../src/lib/data-providers/lnh-scraper.provider";
import { loadLnhResolutionContext, resolveLnhRow } from "../src/lib/ingestion/lnh-player-identity";
import { diffStatFields } from "../src/lib/lnh-corrections/diff";
import { computeLineupPoints, parseScoringConfig, type LineupEntry } from "../src/lib/scoring/engine";
import { computeStatLeaderBonuses, type StatLeaderPlayerInput } from "../src/lib/scoring/stat-leaders";
import { computeGameweekMultiplier, applyMultiplier, parseMultiplierConfig } from "../src/lib/predictions/multiplier";
import { resolveOutcome } from "../src/lib/predictions/outcome";
import { computeCatchupCredit, firstEligibleGameweekNumber, parseCatchupConfig } from "../src/lib/scoring/catchup";
import { rankTeams } from "../src/lib/standings/fantasy-rank";

const prisma = new PrismaClient();
const arg = (k: string, d: number) => Number(process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d);
const FROM = arg("from", 1);
const TO = arg("to", 4);
const LNH_SEASONS_ID = "40";
const EPS = 0.051;

const issues: string[] = [];
const ok: string[] = [];
function check(cond: boolean, okMsg: string, koMsg: () => string) {
  if (cond) ok.push(okMsg);
  else issues.push(koMsg());
}
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const r1 = (v: number) => Math.round(v * 10) / 10;

interface LineupEntryJson { playerId: string; role: "STARTER" | "BENCH"; isCaptain?: boolean }

async function main() {
  const season = await prisma.season.findFirstOrThrow({ where: { isActive: true } });
  const startYear = Number(season.label.slice(0, 4));
  const provider = createLnhScraperProvider();
  const rawConfig = Object.fromEntries((await prisma.gameConfig.findMany()).map((c) => [c.key, c.value]));
  const scoringConfig = parseScoringConfig(rawConfig);
  const multiplierConfig = parseMultiplierConfig(rawConfig);
  const catchupConfig = parseCatchupConfig(rawConfig);

  console.log(`Audit ${season.label}, journées ${FROM}→${TO}\n`);

  const calendar = await provider.fetchSeasonCalendar(LNH_SEASONS_ID, startYear);
  const calById = new Map(calendar.map((f) => [f.calendarsId, f]));
  const resolution = await loadLnhResolutionContext(season.id);
  const players = await prisma.player.findMany({
    where: { seasonId: season.id },
    select: { id: true, firstName: true, lastName: true, clubId: true, externalIds: true },
  });
  const playerById = new Map(players.map((p) => [p.id, p]));
  const allGameweeks = await prisma.gameweek.findMany({
    where: { seasonId: season.id },
    select: { id: true, number: true, deadlineAt: true, isScored: true },
    orderBy: { number: "asc" },
  });

  for (let gwNum = FROM; gwNum <= TO; gwNum++) {
    const gw = await prisma.gameweek.findUniqueOrThrow({
      where: { seasonId_number: { seasonId: season.id, number: gwNum } },
      include: {
        matches: { include: { homeClub: true, awayClub: true, playerStats: true } },
        lineups: { include: { fantasyTeam: { select: { id: true, name: true, validatedAt: true } } } },
      },
    });
    const tag = `J${gwNum}`;
    console.log(`── ${tag} (notée=${gw.isScored}, ${gw.matches.length} matchs, ${gw.lineups.length} alignements)`);

    // ── A. Matchs
    const finishedCalIds: string[] = [];
    for (const m of gw.matches) {
      const label = `${tag} ${m.homeClub.shortName}–${m.awayClub.shortName}`;
      const calId = (m.externalIds as Record<string, string>)?.lnh_calendars_id;
      const f = calId ? calById.get(calId) : undefined;
      if (!f) { issues.push(`[A] ${label} : absent du calendrier lnh.fr (calendars_id=${calId})`); continue; }
      if (f.status === "FINISHED") finishedCalIds.push(calId!);
      const statusOk = f.status === "FINISHED" ? m.status === "FINISHED" : m.status !== "FINISHED";
      check(
        statusOk && (f.status !== "FINISHED" || (m.homeScore === f.homeScore && m.awayScore === f.awayScore)),
        `[A] ${label}`,
        () => `[A] ${label} : base ${m.status} ${m.homeScore}-${m.awayScore} ≠ lnh.fr ${f.status} ${f.homeScore}-${f.awayScore}`
      );
    }

    // ── B. Notes
    const box = await provider.fetchGameweekMatchStats(finishedCalIds, LNH_SEASONS_ID);
    for (const m of gw.matches) {
      const label = `${tag} ${m.homeClub.shortName}–${m.awayClub.shortName}`;
      const calId = (m.externalIds as Record<string, string>)?.lnh_calendars_id;
      const live = m.playerStats.filter((s) => s.isLive);
      if (m.status === "FINISHED") {
        check(live.length === 0, `[B] ${label} sans note provisoire`, () => `[B] ${label} : ${live.length} note(s) provisoire(s) isLive sur un match fini`);
      }
      if (!calId || !box.has(calId)) continue;
      const rows = box.get(calId)!;
      const stored = new Map(m.playerStats.filter((s) => !s.isLive).map((s) => [s.playerId, s]));
      const seen = new Set<string>();
      let diffs = 0, unresolved = 0;
      for (const row of rows) {
        const res = resolveLnhRow(resolution, row);
        if (!res) {
          unresolved++;
          issues.push(`[B] ${label} : lnh.fr « ${row.lastName} ${row.firstName} » (${row.lnhClubSlug}, note ${row.score}) non rapproché`);
          continue;
        }
        seen.add(res.playerId);
        const s = stored.get(res.playerId);
        const changes = diffStatFields((s ?? {}) as Record<string, unknown>, boxscoreRowToStatFields(row) as Record<string, unknown>);
        if (changes.length) {
          diffs++;
          issues.push(`[B] ${label} : ${row.lastName} ${row.firstName} ${s ? "diffère" : "MANQUANT en base"} — ${changes.map((c) => `${c.field} ${c.before}→${c.after}`).join(", ")}`);
        }
      }
      const orphans = [...stored.keys()].filter((id) => !seen.has(id));
      for (const id of orphans) {
        const p = playerById.get(id);
        issues.push(`[B] ${label} : stat en base pour ${p?.lastName} ${p?.firstName} absente du boxscore lnh.fr`);
      }
      const wrongClub = [...stored.values()].filter((s) => {
        const c = playerById.get(s.playerId)?.clubId;
        return c !== m.homeClubId && c !== m.awayClubId;
      });
      for (const s of wrongClub) {
        const p = playerById.get(s.playerId);
        issues.push(`[B] ${label} : ${p?.lastName} ${p?.firstName} noté sur un match qui n'est pas celui de son club`);
      }
      if (!diffs && !unresolved && !orphans.length && !wrongClub.length) ok.push(`[B] ${label} : ${rows.length} lignes lnh.fr = base`);
    }

    // ── F. Alignements
    for (const l of gw.lineups.filter((l) => !l.isCatchup)) {
      const entries = l.entries as unknown as LineupEntryJson[];
      const ids = entries.map((e) => e.playerId);
      const captains = entries.filter((e) => e.isCaptain).length;
      const missing = ids.filter((id) => !playerById.has(id));
      const late = l.fantasyTeam.validatedAt && gw.deadlineAt && l.fantasyTeam.validatedAt > gw.deadlineAt;
      check(
        captains <= 1 && new Set(ids).size === ids.length && missing.length === 0 && !late,
        `[F] ${tag} ${l.fantasyTeam.name}`,
        () => `[F] ${tag} ${l.fantasyTeam.name} : capitaines=${captains}, doublons=${ids.length - new Set(ids).size}, joueurs inconnus=${missing.length}${late ? ", validée APRÈS la deadline" : ""}`
      );
    }

    // ── C. Points (journées notées)
    const realLineups = gw.lineups.filter((l) => !l.isCatchup);
    if (!gw.isScored) {
      const withPoints = realLineups.filter((l) => l.points !== null).length;
      check(withPoints === 0, `[C] ${tag} non notée, aucun point attribué`, () => `[C] ${tag} non notée mais ${withPoints} alignements ont des points`);
      continue;
    }
    const definitive = gw.matches.flatMap((m) => m.playerStats.filter((s) => !s.isLive).map((s) => ({ s, m })));
    const statByPlayer = new Map<string, { lnhRating: number | null; played: boolean; teamWon: boolean }>();
    for (const { s, m } of definitive) {
      const clubId = playerById.get(s.playerId)?.clubId;
      const homeWon = m.homeScore !== null && m.awayScore !== null && m.homeScore > m.awayScore;
      const awayWon = m.homeScore !== null && m.awayScore !== null && m.awayScore > m.homeScore;
      statByPlayer.set(s.playerId, {
        lnhRating: s.lnhRating ? Number(s.lnhRating) : null,
        played: s.played,
        teamWon: clubId === m.homeClubId ? homeWon : awayWon,
      });
    }
    const leaderRows: StatLeaderPlayerInput[] = definitive.map(({ s }) => ({
      playerId: s.playerId, played: s.played, goalsPlay: s.goalsPlay, goalsPenalty: s.goalsPenalty, goalsTotal: s.goalsTotal,
      shotPercentage: n(s.shotPercentage), assists: s.assists, ballsRecovered: s.ballsRecovered,
      opponentShotsBlocked: s.opponentShotsBlocked, penaltiesDrawn: s.penaltiesDrawn, twoMinDrawn: s.twoMinDrawn,
      neutralizations: s.neutralizations, saves: s.saves, savePercentage: n(s.savePercentage), turnovers: s.turnovers,
      twoMinTaken: s.twoMinTaken, disqualified: s.disqualified,
    }));
    const statBonus = computeStatLeaderBonuses(leaderRows, {
      enabled: scoringConfig.statLeaderBonusEnabled,
      bonusPoints: scoringConfig.statLeaderBonusPoints,
      malusPoints: scoringConfig.statLeaderMalusPoints,
    });
    const markets = await prisma.predictionMarket.findMany({ where: { matchId: { in: gw.matches.map((m) => m.id) } }, select: { id: true, matchId: true } });
    const outcomeByMarket = new Map(markets.map((mk) => {
      const m = gw.matches.find((x) => x.id === mk.matchId)!;
      return [mk.id, m.homeScore !== null && m.awayScore !== null ? resolveOutcome(m.homeScore, m.awayScore) : null];
    }));
    const predictions = await prisma.prediction.findMany({ where: { marketId: { in: markets.map((m) => m.id) } }, select: { fantasyTeamId: true, marketId: true, outcome: true } });

    let pointMismatches = 0;
    for (const l of realLineups) {
      const entries = l.entries as unknown as LineupEntryJson[];
      const inputs: LineupEntry[] = entries.map((e) => {
        const st = statByPlayer.get(e.playerId);
        return { lnhRating: st?.lnhRating ?? null, played: st?.played ?? false, role: e.role, teamWon: st?.teamWon ?? false, isCaptain: e.isCaptain ?? false, statBonusPoints: statBonus.get(e.playerId) ?? 0 };
      });
      const raw = computeLineupPoints(inputs, scoringConfig, l.bonus);
      const attempts = predictions
        .filter((p) => p.fantasyTeamId === l.fantasyTeamId)
        .map((p) => { const a = outcomeByMarket.get(p.marketId); return a ? { correct: a === p.outcome } : null; })
        .filter((a): a is { correct: boolean } => a !== null);
      const mult = computeGameweekMultiplier(attempts, multiplierConfig);
      const pts = applyMultiplier(raw, mult);
      const bad =
        l.points === null ||
        Math.abs(Number(l.points) - pts) > EPS ||
        Math.abs(Number(l.rawPoints ?? NaN) - raw) > EPS ||
        Math.abs(Number(l.predictionMultiplier ?? NaN) - mult) > 0.001;
      if (bad) {
        pointMismatches++;
        issues.push(`[C] ${tag} ${l.fantasyTeam.name} : stocké ${n(l.points)} (brut ${n(l.rawPoints)} ×${n(l.predictionMultiplier)}) ≠ recalcul ${pts} (brut ${raw} ×${mult})`);
      }
    }
    if (!pointMismatches) ok.push(`[C] ${tag} : ${realLineups.length} alignements, points = recalcul`);

    // ── D. Accueil
    const realPts = realLineups.filter((l) => l.points !== null).map((l) => Number(l.points));
    const expectedCredit = computeCatchupCredit(realPts, catchupConfig);
    const catchups = gw.lineups.filter((l) => l.isCatchup);
    const badCredit = catchups.filter((l) => Math.abs(Number(l.points) - expectedCredit) > EPS);
    check(badCredit.length === 0, `[D] ${tag} : ${catchups.length} lignes d'accueil à ${expectedCredit}`, () =>
      `[D] ${tag} : ${badCredit.length}/${catchups.length} lignes d'accueil ≠ ${expectedCredit} (ex. ${badCredit.slice(0, 3).map((l) => `${l.fantasyTeam.name}=${n(l.points)}`).join(", ")})`);
    for (const l of catchups) {
      const t = await prisma.fantasyTeam.findUniqueOrThrow({ where: { id: l.fantasyTeamId }, select: { validatedAt: true, createdAt: true } });
      const first = firstEligibleGameweekNumber(allGameweeks, t.validatedAt ?? t.createdAt);
      if (first === null || gwNum >= first) issues.push(`[D] ${tag} ${l.fantasyTeam.name} : ligne d'accueil sur une journée où l'équipe était éligible (1ʳᵉ journée jouable J${first})`);
      if (realLineups.some((r) => r.fantasyTeamId === l.fantasyTeamId)) issues.push(`[D] ${tag} ${l.fantasyTeam.name} : ligne d'accueil ET vrai alignement`);
    }
  }

  // ── E. Totaux + snapshots
  const teams = await prisma.fantasyTeam.findMany({
    where: { isValidated: true, league: { seasonId: season.id } },
    select: { id: true, name: true, leagueId: true, totalPoints: true, pointsConverted: true, lineups: { where: { points: { not: null } }, select: { points: true, gameweek: { select: { number: true } } } } },
  });
  let totalBad = 0;
  for (const t of teams) {
    const expected = r1(t.lineups.reduce((s, l) => s + Number(l.points), 0) - Number(t.pointsConverted));
    if (Math.abs(Number(t.totalPoints) - expected) > EPS) {
      totalBad++;
      issues.push(`[E] ${t.name} : totalPoints ${n(t.totalPoints)} ≠ Σ lignes − convertis ${expected}`);
    }
  }
  if (!totalBad) ok.push(`[E] ${teams.length} équipes : totalPoints = Σ points − convertis`);

  const scoredNums = allGameweeks.filter((g) => g.isScored && g.number >= FROM && g.number <= TO).map((g) => g.number);
  for (const num of scoredNums) {
    const ranked = rankTeams(teams.map((t) => ({
      teamId: t.id,
      leagueId: t.leagueId,
      cumulativePoints: r1(t.lineups.filter((l) => l.gameweek.number <= num).reduce((s, l) => s + Number(l.points), 0) - Number(t.pointsConverted)),
    })));
    const snaps = new Map((await prisma.fantasyStandingSnapshot.findMany({ where: { seasonId: season.id, mode: "LIVE", gameweekNumber: num } })).map((s) => [s.teamId, s]));
    let bad = 0;
    for (const r of ranked) {
      const s = snaps.get(r.teamId);
      if (!s || Math.abs(Number(s.cumulativePoints) - r.cumulativePoints) > EPS || s.globalRank !== r.globalRank || s.leagueRank !== r.leagueRank) {
        bad++;
        if (bad <= 5) issues.push(`[E] snapshot J${num} ${teams.find((t) => t.id === r.teamId)?.name} : ${s ? `${n(s.cumulativePoints)} pts, #${s.globalRank}/#${s.leagueRank}` : "ABSENT"} ≠ attendu ${r.cumulativePoints} pts, #${r.globalRank}/#${r.leagueRank}`);
      }
    }
    if (bad > 5) issues.push(`[E] snapshot J${num} : … ${bad} équipes en écart au total`);
    if (!bad) ok.push(`[E] snapshot J${num} : ${ranked.length} équipes, cumul + rangs = recalcul`);
  }

  // ── G. Valeurs
  const dupValues = await prisma.playerValueHistory.groupBy({
    by: ["playerId", "gameweekId"],
    where: { gameweek: { seasonId: season.id, number: { gte: FROM, lte: TO } } },
    _count: { _all: true },
    having: { playerId: { _count: { gt: 1 } } },
  });
  check(dupValues.length === 0, `[G] aucune valeur en double par (joueur, journée)`, () => `[G] ${dupValues.length} couples (joueur, journée) avec plusieurs PlayerValueHistory`);

  // ── H. Joueurs
  const slugCount = new Map<string, number>();
  let noSlug = 0;
  for (const p of players) {
    const slug = (p.externalIds as Record<string, unknown> | null)?.lnh_slug;
    if (typeof slug === "string") slugCount.set(slug, (slugCount.get(slug) ?? 0) + 1);
    else noSlug++;
  }
  const dupSlugs = [...slugCount].filter(([, c]) => c > 1);
  check(dupSlugs.length === 0, `[H] aucun slug lnh.fr en double`, () => `[H] slugs en double : ${dupSlugs.map(([s]) => s).join(", ")}`);
  ok.push(`[H] ${players.length} joueurs, ${players.length - noSlug} avec slug lnh.fr, ${noSlug} sans (absents des stats lnh.fr cette saison)`);

  console.log(`\n✅ ${ok.length} contrôles OK`);
  for (const o of ok.filter((o) => !o.startsWith("[A]") && !o.startsWith("[F]") && !/^\[B\] .* sans note provisoire/.test(o))) console.log(`   ${o}`);
  console.log(`\n${issues.length ? "❌" : "✅"} ${issues.length} anomalie(s)`);
  for (const i of issues) console.log(`   ${i}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
