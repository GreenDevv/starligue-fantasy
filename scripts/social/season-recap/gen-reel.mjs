// Reel « bilan après N journées » : <outDir>/data.json (fantasy-recap/pull.ts +
// season-recap/pull-extra.ts) → <outDir>/reel/reel.html (self-contained,
// window.seek(t), rendu image par image par render-reel.mjs).
//
//   node scripts/social/season-recap/gen-reel.mjs <outDir>
//
// Deux actes, coupes rapides, chiffres qui comptent en direct :
//  Acte 1 — la vraie Starligue : chiffres clés → records de matchs → classement
//           (couleurs par groupe de points) → leaders LNH → équipe type → top perfs
//  Acte 2 — le parallèle managers : le jeu en chiffres → les chouchous qui ont coûté
//           cher → le pari gagnant → le capitaine préféré → le record en une journée
//           → l'équipe parfaite → classement général + remontée → podium → clubs de
//           cœur (carte) → plan final.
//
// Animation générique : tout élément .a entre selon data-d (délai ms dans la scène)
// et data-fx (up|left|right|pop|zoom) ; .cnt compte jusqu'à data-to ; .bar grandit
// jusqu'à data-w %. Un balayage ambre marque chaque changement de scène.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { REPO, HERE as GWPACK_HERE, clubName } from "../gameweek-pack/config.mjs";

const OUT_DIR = process.argv[2];
if (!OUT_DIR) {
  console.error("usage: gen-reel.mjs <outDir>");
  process.exit(1);
}
const REEL_DIR = join(OUT_DIR, "reel");
const ASSETS = join(REEL_DIR, "assets");
mkdirSync(ASSETS, { recursive: true });

const d = JSON.parse(readFileSync(join(OUT_DIR, "data.json"), "utf-8"));
const R = d.recap;
const F = d.fantasy;
const N = R.gameweeks;
const GW_LABEL = `J${d.firstGameweekNumber}–J${d.lastGameweekNumber}`;
const SEASON_SHORT = (() => {
  const m = String(d.season).match(/(\d{2})(\d{2}).*?(\d{2})(\d{2})/);
  return m ? `${m[2]}·${m[4]}` : String(d.season);
})();

// ---------- assets ----------
const b64file = (p) => "data:image/png;base64," + readFileSync(p).toString("base64");
const OVR = join(GWPACK_HERE, "reel", "logo-overrides");
const hasOvr = (sn) => existsSync(join(OVR, sn.toLowerCase() + ".png"));
const clubLogo = (sn) => b64file(hasOvr(sn) ? join(OVR, sn.toLowerCase() + ".png") : join(REPO, "public/clubs", sn.toLowerCase() + ".png"));
const rawLogo = (sn) => b64file(join(REPO, "public/clubs", sn.toLowerCase() + ".png"));
const WHITE_BG = new Set(["CRMHB", "USAM"]);

function resolveCartoKey() {
  const fromEnv = process.env.NEXT_PUBLIC_CARTO_API_KEY || process.env.CARTO_API_KEY;
  if (fromEnv) return fromEnv;
  try {
    const out = execFileSync("railway", ["variables", "--service", "web", "--kv"], { encoding: "utf8", cwd: REPO });
    const line = out.split("\n").find((l) => l.startsWith("NEXT_PUBLIC_CARTO_API_KEY="));
    if (line) return line.slice("NEXT_PUBLIC_CARTO_API_KEY=".length).trim();
  } catch { /* railway CLI absente */ }
  return "";
}
const CARTO_KEY = resolveCartoKey();

const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
async function ensurePhoto(key, url) {
  const f = join(ASSETS, slug(key) + ".png");
  if (existsSync(f)) return f;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", Referer: "https://www.lnh.fr/" } });
  if (!res.ok) throw new Error(`photo ${key}: HTTP ${res.status}`);
  writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  return f;
}
const photoPath = {};
const want = [
  ...F.bestXICombined.map((e) => [e.lastName, e.firstName, e.photoUrl]),
  ...F.topPerformances.map((p) => [p.player?.lastName, p.player?.firstName, p.player?.photoUrl]),
  ...Object.values(R.lnhLeaders).flat().map((l) => [l.lastName, l.firstName, l.photoUrl]),
  ...[R.managers.favourite, R.managers.flop, R.managers.differential, R.managers.captain, R.managers.bestValue, R.gwRecord?.captain]
    .filter(Boolean).map((c) => [c.lastName, c.firstName, c.photoUrl]),
  ...R.dreamTeam.starters.map((c) => [c.lastName, c.firstName, c.photoUrl]),
  ...(R.topPlayers ?? []).map((c) => [c.lastName, c.firstName, c.photoUrl]),
  ...[R.flash?.mostGoalsInMatch, R.flash?.sniper].filter(Boolean).map((c) => [c.lastName, c.firstName, c.photoUrl]),
];
for (const [last, first, url] of want) {
  if (!url || !last) continue;
  const k = `${last} ${first}`;
  if (photoPath[k]) continue;
  try { photoPath[k] = await ensurePhoto(k, url); } catch (err) { console.warn(String(err)); }
}
const pImg = (last, first) => (photoPath[`${last} ${first}`] ? b64file(photoPath[`${last} ${first}`]) : null);

const clubLogoDataUri = {};
for (const c of F.heartClubsTop5 ?? []) {
  if (!c.logoUrl) continue;
  const ext = (c.logoUrl.split(".").pop() || "webp").split("?")[0];
  const f = join(ASSETS, "club-" + slug(c.name) + "." + ext);
  try {
    if (!existsSync(f)) {
      const r = await fetch(c.logoUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (r.ok) writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    }
    if (existsSync(f)) clubLogoDataUri[c.name] = `data:image/${ext === "svg" ? "svg+xml" : ext};base64,` + readFileSync(f).toString("base64");
  } catch (err) { console.warn(String(err)); }
}

// ---------- helpers ----------
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const frNum = (n, dec = 0) =>
  Number(n).toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).replace(/ | /g, " ");
const decOf = (n) => (Number.isInteger(Number(n)) ? 0 : 1);
/** compteur animé : <span class="cnt" data-to data-dec data-d> */
const cnt = (to, d0, { dec = decOf(to), dur = 900, sign = false } = {}) =>
  `<span class="cnt" data-to="${to}" data-dec="${dec}" data-d="${d0}" data-dur="${dur}" data-sign="${sign ? 1 : 0}">${frNum(0, dec)}</span>`;
const A = (fx, d0, inner, cls = "", style = "") => `<div class="a ${cls}" data-fx="${fx}" data-d="${d0}"${style ? ` style="${style}"` : ""}>${inner}</div>`;
const face = (c, size = 150) => {
  const img = c ? pImg(c.lastName, c.firstName) : null;
  return `<span class="face" style="width:${size}px;height:${size}px">${img ? `<img src="${img}"/>` : ""}</span>`;
};
const logo = (sn, size = 64) => `<img class="lg" src="${clubLogo(sn)}" style="width:${size}px;height:${size}px"/>`;
const shortClubName = (n) => String(n).replace(/\s+(HANDBALL|HAND|HB|HBC|HBH|H\.?B\.?|CLUB)\.?$/i, "").replace(/\s+-\s+.*$/, "").trim() || String(n);
const POS_FR = { GK: "gardien", LW: "ailier gauche", LB: "arrière gauche", CB: "demi-centre", RB: "arrière droit", RW: "ailier droit", PV: "pivot" };

const scenes = []; // { id, dur, html }
// PACE < 1 : chaque scène dure PACE × sa durée « de conception », et tout ce qui s'y
// anime (délais data-d, compteurs, barres) est joué 1/PACE fois plus vite (renderScene).
const PACE = 0.85;
const scene = (id, dur, html, cls = "", style = "") => scenes.push({ id, dur: Math.round(dur * PACE), html: `<section id="${id}" class="scene ${cls}"${style ? ` style="${style}"` : ""}>${html}</section>` });
const hd = (ey, title, sub = "", d0 = 0) =>
  `<div class="hd">${A("up", d0, `<div class="ey">${ey}</div>`)}${A("pop", d0 + 80, `<div class="h1">${title}</div>`)}${sub ? A("up", d0 + 200, `<div class="sub2">${sub}</div>`) : ""}</div>`;
const EY1 = `Daikin StarLigue ${SEASON_SHORT} &middot; bilan ${GW_LABEL}`;
const EY2 = `Starligue Fantasy &middot; bilan ${GW_LABEL}`;

// ---------- écrans « flash » : un chiffre géant plein écran, entre deux scènes ----------
const FLASH_TONES = { amber: ["#F59E0B", "#B45309"], teal: ["#2DD4BF", "#0F766E"], red: ["#F87171", "#991B1B"], violet: ["#A78BFA", "#5B21B6"] };
function flash(id, tone, big, line1, line2 = "", who = null) {
  const [c1, c2] = FLASH_TONES[tone];
  scene(id, 2100, `
    <div class="flash-in">
      ${who ? A("pop", 60, face(who, 220)) : ""}
      ${A("slam", 80, `<div class="fbig">${big}</div>`)}
      ${A("up", 320, `<div class="fl1">${line1}</div>`)}
      ${line2 ? A("up", 480, `<div class="fl2">${line2}</div>`) : ""}
    </div>`, "flash", `background:radial-gradient(circle at 50% 40%, ${c1}, ${c2} 70%)`);
}

// ========== 0. INTRO ==========
scene("intro", 2600, `
  <div class="intro-in">
    ${A("up", 100, `<div class="ey">Daikin StarLigue ${SEASON_SHORT} &middot; Starligue Fantasy</div>`)}
    ${A("zoom", 250, `<div class="mega">${N}</div>`)}
    ${A("pop", 520, `<div class="h1 big">journées.<br/><b>Le bilan.</b></div>`)}
    ${A("up", 900, `<div class="sub2">ce que disent vraiment les chiffres</div>`)}
  </div>`, "bg-intro");

// ========== 1. STARLIGUE EN CHIFFRES ==========
const S = R.starligue;
const statTile = (value, label, d0, opts = {}) =>
  A("pop", d0, `<div class="tile${opts.hot ? " hot" : ""}"><div class="tv">${cnt(value, d0 + 80, { dec: opts.dec })}${opts.unit ? `<u>${opts.unit}</u>` : ""}</div><div class="tl">${label}</div></div>`);
scene("numbers", 5200, `
  ${hd(EY1, `${N} journées <b>en chiffres</b>`)}
  <div class="tiles">
    ${statTile(S.matches, "matchs joués", 300)}
    ${statTile(S.goals, "buts marqués", 480, { hot: true })}
    ${statTile(S.goalsPerMatch, "buts par match", 660, { dec: 1 })}
    ${statTile(S.draws, `match nul`, 840, { hot: S.draws === 0 })}
    ${statTile(S.oneGoalGames, "matchs gagnés d'un but", 1020)}
    ${statTile(S.homeWinPct, "victoires à domicile", 1200, { unit: "%" })}
  </div>
  ${S.draws === 0 ? A("up", 2100, `<div class="punch">Zéro nul en <b>${S.matches} matchs.</b></div>`) : ""}
`, "bg-rad");

const FX = R.flash ?? {};
if (FX.secondsPerGoal) flash("f-goal", "amber", `${FX.secondsPerGoal}<u>s</u>`, "entre deux buts, en moyenne", `${frNum(S.goals)} buts en ${S.matches} matchs de 60 minutes`);

// ========== 2. RECORDS DE MATCHS ==========
const matchCard = (m, tag, note, d0) => A("left", d0, `<div class="mcard">
  <div class="mtag">${tag}</div>
  <div class="mrow">
    <div class="mclub">${logo(m.home, 120)}<span>${esc(clubName(m.home))}</span></div>
    <div class="mscore">${cnt(m.homeScore, d0 + 250, { dur: 700 })}<i>-</i>${cnt(m.awayScore, d0 + 250, { dur: 700 })}</div>
    <div class="mclub">${logo(m.away, 120)}<span>${esc(clubName(m.away))}</span></div>
  </div>
  <div class="mnote">J${m.gw} &middot; ${note}</div>
</div>`);
scene("records", 4400, `
  ${hd(EY1, `Les matchs <b>hors normes</b>`)}
  <div class="mcards">
    ${S.biggestWin ? matchCard(S.biggestWin, "La plus grosse claque", `${Math.abs(S.biggestWin.homeScore - S.biggestWin.awayScore)} buts d'écart`, 300) : ""}
    ${S.highestScoring ? matchCard(S.highestScoring, "Le match fou", `${S.highestScoring.homeScore + S.highestScoring.awayScore} buts dans le match`, 900) : ""}
  </div>
`, "bg-rad");

// ========== 3. CLASSEMENT STARLIGUE ==========
const GROUP_PALETTE = [[45, 212, 191], [245, 158, 11], [52, 211, 153], [248, 113, 113], [100, 116, 139]];
const blend = (base, rgb, a) => base.map((c, i) => Math.round(c * (1 - a) + rgb[i] * a));
let grp = -1, lastPts = null;
const standRows = S.standing.map((r, i) => {
  if (r.points !== lastPts) { grp++; lastPts = r.points; }
  const bg = blend([14, 17, 22], GROUP_PALETTE[grp % GROUP_PALETTE.length], 0.18).join(",");
  const tag = S.unbeaten.includes(r.club) ? `<em class="tg ok">invaincu</em>` : S.winless.includes(r.club) ? `<em class="tg ko">0 victoire</em>` : "";
  return A(i % 2 ? "right" : "left", 250 + i * 55, `<div class="srow" style="background:rgb(${bg})">
    <span class="sr">${r.rank}</span>${logo(r.club, 46)}<span class="sn">${esc(clubName(r.club))}${tag}</span>
    <span class="sv">${r.wins}V ${r.draws}N ${r.losses}D</span><span class="sga">${r.goalAvg > 0 ? "+" : ""}${r.goalAvg}</span><span class="sp">${r.points}</span>
  </div>`);
}).join("");
scene("standing", 5400, `
  ${hd(EY1, `Le <b>classement</b>`, `après la journée ${d.lastGameweekNumber}`)}
  <div class="stable">${standRows}</div>
`, "bg-rad");

if (FX.penalties?.attempted) flash("f-pen", "teal", `${Math.round((FX.penalties.scored / FX.penalties.attempted) * 100)}<u>%</u>`, "des penaltys transformés", `${frNum(FX.penalties.scored)} sur ${frNum(FX.penalties.attempted)}`);

// ========== 4. LEADERS LNH (un écran par stat, top 5) ==========
const leaderScene = (id, title, unit, list) => scene(id, 4300, `
  ${hd(EY1, title, `cumul depuis la journée ${d.firstGameweekNumber}`)}
  <div class="l5">${list.map((l, i) => A(i % 2 ? "right" : "left", 250 + i * 140, `<div class="l5row${i === 0 ? " first" : ""}">
    <span class="lr">${i + 1}</span>${face(l, i === 0 ? 170 : 110)}
    <span class="ln"><b>${esc(l.lastName)}</b><em>${esc(l.firstName)} &middot; ${esc(clubName(l.club))}</em></span>
    <span class="lv">${cnt(l.value, 350 + i * 140, { dur: 800 })}<u>${unit}</u></span>
  </div>`)).join("")}</div>
`, "bg-rad");
leaderScene("lg-goals", `Les <b>buteurs</b>`, "buts", R.lnhLeaders.goals);
const MG = FX.mostGoalsInMatch;
if (MG) flash("f-perfect", "amber", `${MG.goals}/${MG.shots}`, `${esc(MG.lastName)} &middot; ${MG.goals === MG.shots ? "un match parfait" : "record de buts en un match"}`, `J${MG.gw} contre ${esc(clubName(MG.opponent))}`, MG);
leaderScene("lg-assists", `Les <b>passeurs</b>`, "dernières passes", R.lnhLeaders.assists);
leaderScene("lg-saves", `Les <b>gardiens</b>`, "arrêts", R.lnhLeaders.saves);
if (FX.twoMin != null) flash("f-disc", "red", `${frNum(FX.twoMin)}`, "exclusions de 2 minutes", `et ${FX.redCards} carton${FX.redCards > 1 ? "s" : ""} rouge${FX.redCards > 1 ? "s" : ""}`);

// ========== 5 & 12. TERRAINS (équipe type cumulée / équipe parfaite) ==========
const COURT = 200, VIEW_TOP = 62, GOAL_DEPTH = 16, BOTTOM_PAD = 4;
const VIEW_H = COURT + GOAL_DEPTH - VIEW_TOP + BOTTOM_PAD;
const PHOTO_W = 22, PHOTO_H = PHOTO_W * 1.5;
const SLOT = { GK: { x: 100.9, y: 198 }, PV: { x: 100.3, y: 147 }, LB: { x: 165.4, y: 93 }, CB: { x: 99.2, y: 99 }, RB: { x: 35.6, y: 95.2 }, LW: { x: 169.1, y: 151 }, RW: { x: 29, y: 154.5 } };
const XI_ORDER = ["GK", "LW", "LB", "CB", "RB", "RW", "PV"];
const pctPos = (c, dx = 0, dy = 0) => ({ left: ((c.x + dx) / COURT) * 100, top: ((c.y + dy - VIEW_TOP) / VIEW_H) * 100 });
function namePlateSVG(cx, topY, name) {
  const label = name.toUpperCase();
  const fs = label.length > 14 ? 7 : label.length > 10 ? 8 : 9, padX = 3.2, padY = 2.2;
  const w = label.length * fs * 0.52 + padX * 2, h = fs + padY * 2;
  return `<rect x="${(cx - w / 2).toFixed(2)}" y="${topY.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${(h / 2).toFixed(2)}" fill="#060E0A" fill-opacity="0.82" stroke="#2DD4BF" stroke-opacity="0.24" stroke-width="0.5"/>
    <text x="${cx.toFixed(2)}" y="${(topY + h / 2 + fs * 0.34).toFixed(2)}" text-anchor="middle" fill="#F1F5F9" font-size="${fs}" font-weight="700" style="font-family:'Barlow Condensed',sans-serif">${esc(label)}</text>`;
}
/** players: [{pos, first, last, sn, pts, sub}] — sub = pastille grise (%, prix…) */
function court(prefix, players, d0) {
  const XI = players.filter((p) => SLOT[p.pos]).sort((a, b) => XI_ORDER.indexOf(a.pos) - XI_ORDER.indexOf(b.pos));
  const plates = XI.map((p) => namePlateSVG(SLOT[p.pos].x, SLOT[p.pos].y + 2, p.last)).join("");
  const over = XI.map((p, i) => {
    const c = SLOT[p.pos], ph = pctPos(c, 0, -PHOTO_H), img = pImg(p.last, p.first), dd = d0 + 250 + i * 120;
    const club = pctPos(c, PHOTO_W / 2 - 2, -3), pts = pctPos(c, -PHOTO_W / 2 - 1, -PHOTO_H * 0.52), sub = pctPos(c, -PHOTO_W / 2 - 1, -PHOTO_H * 0.18);
    const white = WHITE_BG.has(p.sn), pos = p.pts >= 0;
    return `<div class="a pp" data-fx="up" data-d="${dd}" style="left:${ph.left}%;top:${ph.top}%;width:${(PHOTO_W / COURT) * 100}%">${img ? `<img src="${img}"/>` : ""}</div>
      <div class="a pb" data-fx="pop" data-d="${dd + 60}" style="left:${club.left}%;top:${club.top}%;width:${(9.5 / COURT) * 100}%${white ? ";background:#fff" : ""}"><img src="${rawLogo(p.sn)}"${white ? ' style="padding:8%"' : ""}/></div>
      <div class="a pv" data-fx="pop" data-d="${dd + 120}" style="left:${pts.left}%;top:${pts.top}%;width:${(15 / COURT) * 100}%;border-color:${pos ? "#34D399" : "#F87171"};color:${pos ? "#34D399" : "#F87171"}">${frNum(Math.round(p.pts))}</div>
      ${p.sub ? `<div class="a po" data-fx="pop" data-d="${dd + 300}" style="left:${sub.left}%;top:${sub.top}%;width:${(13 / COURT) * 100}%">${p.sub}</div>` : ""}`;
  }).join("");
  return `<div class="a court" data-fx="zoom" data-d="${d0}">
    <svg viewBox="0 ${VIEW_TOP} ${COURT} ${VIEW_H}">
      <defs><radialGradient id="cf${prefix}" cx="50%" cy="15%" r="95%"><stop offset="0%" stop-color="#15291F"/><stop offset="100%" stop-color="#08140E"/></radialGradient>
      <pattern id="net${prefix}" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 0 L4 4 M4 0 L0 4" stroke="#2DD4BF" stroke-width="0.4" stroke-opacity="0.35"/></pattern></defs>
      <rect x="0" y="${VIEW_TOP}" width="${COURT}" height="${COURT - VIEW_TOP}" fill="url(#cf${prefix})"/>
      <path d="M 2 ${VIEW_TOP} L 2 ${COURT - 2} L ${COURT - 2} ${COURT - 2} L ${COURT - 2} ${VIEW_TOP}" fill="none" stroke="#2DD4BF" stroke-width="1.25" stroke-opacity="0.35"/>
      <path d="M 10 ${COURT} A 90 90 0 0 1 190 ${COURT}" fill="none" stroke="#2DD4BF" stroke-width="1.25" stroke-opacity="0.4" stroke-dasharray="4 3"/>
      <path d="M 40 ${COURT} A 60 60 0 0 1 160 ${COURT} Z" fill="#2DD4BF" fill-opacity="0.07" stroke="#2DD4BF" stroke-width="1.5" stroke-opacity="0.6"/>
      <rect x="85" y="${COURT}" width="30" height="${GOAL_DEPTH}" fill="url(#net${prefix})" stroke="#2DD4BF" stroke-width="1.5" stroke-opacity="0.8"/>
      ${plates}
    </svg>
    <div class="overlay">${over}</div>
  </div>`;
}
const XI_SEASON = F.bestXICombined.map((e) => ({
  pos: e.position, first: e.firstName, last: e.lastName, sn: e.club.shortName, pts: e.points,
  sub: `${R.bestXITeams?.[e.playerId] ?? 0}`,
}));
const xiTotal = F.bestXICombined.reduce((s, e) => s + e.points, 0);
scene("xi", 5400, `
  ${hd(EY1, `L'équipe <b>type</b>`, `points fantasy cumulés &middot; pastille grise = nombre d'équipes qui l'ont eu`)}
  ${court("X", XI_SEASON, 200)}
  ${A("up", 1500, `<div class="punch small">${cnt(Math.round(xiTotal), 1600)} pts à 7 &middot; la meilleure à chaque poste</div>`)}
`, "bg-rad pitchwrap");

// ========== 5bis. TOP 10 JOUEURS (points fantasy cumulés) ==========
const TOPP = R.topPlayers ?? [];
const topMax = Math.max(1, ...TOPP.map((p) => p.points));
scene("topplayers", 6200, `
  ${hd(EY1, `Ils rapportent <b>le plus</b>`, `points fantasy cumulés &middot; nombre d'équipes qui l'ont eu`)}
  <div class="tlist">${TOPP.map((p, i) => A(i % 2 ? "right" : "left", 220 + i * 110, `<div class="trow${i === 0 ? " first" : ""}">
    <span class="tr">${i + 1}</span>${face(p, 78)}
    <div class="tmid"><div class="ttop"><b>${esc(p.lastName)}</b><em>${esc(clubName(p.club))} &middot; ${p.teams} équipe${p.teams > 1 ? "s" : ""}</em></div>
      <div class="ttrack"><div class="bar" data-w="${Math.round((p.points / topMax) * 100)}" data-d="${300 + i * 110}"></div></div></div>
    <span class="tp">${cnt(p.points, 300 + i * 110, { dur: 900 })}</span>
  </div>`)).join("")}</div>
`, "bg-rad");

// ========== 6. TOP 5 PERFS ==========
const RESULT_COLOR = { W: "#34D399", D: "#94A3B8", L: "#F87171" };
const perfRows = F.topPerformances.slice(0, 5).map((p, i) => {
  const m = p.match;
  const res = m ? (m.ownScore > m.oppScore ? "W" : m.ownScore < m.oppScore ? "L" : "D") : null;
  const own = p.ownership.count === 0 ? "aucun manager ne l'avait" : `${p.ownership.count} manager${p.ownership.count > 1 ? "s" : ""} l'avai${p.ownership.count > 1 ? "ent" : "t"}${p.ownership.captains ? ` &middot; ${p.ownership.captains} en capitaine` : ""}`;
  return A(i % 2 ? "right" : "left", 250 + i * 160, `<div class="prow${i === 0 ? " first" : ""}">
    <span class="pr">${i + 1}</span>${face(p.player ? { lastName: p.player.lastName, firstName: p.player.firstName } : null, 130)}
    <span class="pn"><b>${esc(p.player?.lastName)}</b><em>${esc(clubName(p.player?.club?.shortName))} &middot; J${p.gameweekNumber}${m ? ` &middot; ${m.isHome ? "vs" : "@"} ${esc(clubName(m.opponent))} <i style="color:${RESULT_COLOR[res]}">${m.ownScore}-${m.oppScore}</i>` : ""}</em><em class="own">${own}</em></span>
    <span class="pp2">${cnt(p.points, 400 + i * 160, { dur: 800 })}<u>pts</u></span>
  </div>`);
}).join("");
scene("perfs", 5400, `
  ${hd(EY1, `Les <b>perfs</b> de folie`, `meilleurs scores fantasy en un match`)}
  <div class="plist">${perfRows}</div>
`, "bg-rad");

const SN = FX.sniper;
if (SN) flash("f-sniper", "violet", `${SN.pct}<u>%</u>`, `${esc(SN.lastName)}, tireur d'élite`, `${SN.goals} buts sur ${SN.shots} tirs &middot; ${esc(clubName(SN.club))}`, SN);

// ========== 7. LE JEU EN CHIFFRES (transition acte 2) ==========
const M = R.managers;
scene("game", 4200, `
  ${hd(EY2, `Et côté <b>managers</b> ?`)}
  <div class="tiles">
    ${statTile(M.teams, "managers en course", 300)}
    ${statTile(M.lineups, "équipes alignées", 480)}
    ${statTile(M.pointsDistributed, "points distribués", 660, { hot: true })}
    ${statTile(M.avgPerLineup, "pts par équipe et par journée", 840, { dec: 1 })}
    ${R.predictions.pct != null ? statTile(R.predictions.pct, `de bons pronos (${frNum(R.predictions.total)})`, 1020, { unit: "%" }) : ""}
    ${statTile(R.gameweeks, "journées notées", 1200)}
  </div>
`, "bg-rad");

// ========== 8. LES CHOUCHOUS QUI ONT COÛTÉ CHER ==========
const bigCard = (c, badge, line1, d0, tone = "neg") => A("pop", d0, `<div class="bcard ${tone}">
  ${face(c, 210)}
  <div class="bmid">
    <div class="bbadge">${badge}</div>
    <div class="bname"><i>${esc(c.firstName)}</i>${esc(c.lastName)}</div>
    <div class="bsub">${esc(clubName(c.club))} &middot; ${POS_FR[c.position] ?? ""}${c.initialValue ? ` &middot; ${frNum(c.initialValue, decOf(c.initialValue))} M€` : ""}</div>
    <div class="bline">${line1}</div>
  </div>
  <div class="bpts">${cnt(c.points, d0 + 450, { dur: 1000, sign: true })}<u>pts</u></div>
</div>`);
const chouchous = [M.favourite, M.flop].filter((c, i, arr) => c && arr.findIndex((x) => x?.playerId === c.playerId) === i);
scene("chouchous", 5000, `
  ${hd(EY2, `Les chouchous… <b>qui coûtent</b>`)}
  <div class="bcards">
    ${chouchous.map((c, i) => bigCard(c, i === 0 ? "Le plus sélectionné" : "Très sélectionné", `dans <b>${cnt(c.ownershipPct, 700 + i * 900, { dur: 700 })}%</b> des équipes`, 300 + i * 900)).join("")}
  </div>
  ${chouchous.every((c) => c.points < 0) ? A("up", 2500, `<div class="punch">Tout le monde les avait. <b>Personne n'aurait dû.</b></div>`) : ""}
`, "bg-rad");

if (FX.negativeCaptains) flash("f-cap", "red", `${FX.negativeCaptains}`, "capitaines ont fait perdre des points", `sur ${frNum(FX.captaincies)} brassards distribués`);

// ========== 9. LE PARI GAGNANT ==========
const dif = M.differential, bv = M.bestValue;
scene("diff", 4600, `
  ${hd(EY2, `Le pari <b>gagnant</b>`)}
  ${dif ? bigCard(dif, "Le joueur que personne n'avait", `seulement <b>${cnt(dif.ownershipPct, 900, { dur: 600 })}%</b> des équipes`, 300, "pos") : ""}
  ${bv ? A("up", 1700, `<div class="punch">${bv.playerId === dif?.playerId ? "Et le plus rentable du jeu :" : `Le plus rentable : <b>${esc(bv.lastName)}</b> ·`} <b>${cnt(bv.ptsPerM, 1800, { dec: 1 })} pts</b> par million investi</div>`) : ""}
`, "bg-rad");

// ========== 10. LE CAPITAINE PRÉFÉRÉ ==========
const cap = M.captain;
scene("captain", 4200, cap ? `
  ${hd(EY2, `Le capitaine <b>préféré</b>`)}
  ${bigCard(cap, "Brassard ×2", `capitaine <b>${cnt(cap.captaincies, 700, { dur: 700 })}</b> fois`, 300, "pos")}
  ${A("up", 1600, `<div class="punch">Le brassard lui a rapporté <b>+${cnt(Math.round(cap.captainBonus), 1700)} pts</b> aux managers</div>`)}
` : "", "bg-rad");

// ========== 11. LE RECORD EN UNE JOURNÉE ==========
const rec = R.gwRecord;
scene("record", 5000, rec ? `
  ${hd(EY2, `Le record en <b>une journée</b>`)}
  ${A("zoom", 300, `<div class="recnum">${cnt(rec.points, 350, { dur: 1400 })}<u>pts</u></div>`)}
  ${A("pop", 1200, `<div class="recwho"><b>${esc(rec.manager)}</b><em>journée ${rec.gameweek}${rec.league ? ` &middot; ligue ${esc(rec.league)}` : ""}</em></div>`)}
  ${A("up", 1700, `<div class="recvs"><div><span>${cnt(rec.gwAverage, 1800, { dec: 1 })}</span><em>moyenne des managers cette journée-là</em></div>${rec.captain ? `<div>${face(rec.captain, 110)}<span>${cnt(rec.captain.gwPoints, 2100, { dec: decOf(rec.captain.gwPoints) })}</span><em>son capitaine ${esc(rec.captain.lastName)} (avant le ×2)</em></div>` : ""}</div>`)}
` : "", "bg-rad");

if (FX.worstLineup != null && FX.worstLineup < 0) flash("f-worst", "violet", frNum(FX.worstLineup, decOf(FX.worstLineup)), "le pire score d'une équipe", "en une seule journée &middot; on ne dira pas qui 🤫");

// ========== 12. L'ÉQUIPE PARFAITE ==========
const DT = R.dreamTeam;
const DT_STARTERS = DT.starters.map((c) => ({ pos: c.position, first: c.firstName, last: c.lastName, sn: c.club, pts: c.points, sub: `${frNum(c.initialValue, decOf(c.initialValue))}M` }));
const cmpMax = Math.max(DT.points, DT.vsLeader?.points ?? 0, DT.vsAverage);
const cmpBar = (label, value, cls, d0) => A("left", d0, `<div class="cmp ${cls}">
  <div class="cl"><b>${label}</b><span>${cnt(value, d0 + 100, { dec: decOf(value) })}</span></div>
  <div class="ctrack"><div class="bar" data-w="${Math.max(3, Math.round((value / cmpMax) * 100))}" data-d="${d0 + 100}"></div></div>
</div>`);
scene("dream", 7000, `
  ${hd(EY2, `L'équipe <b>parfaite</b>`, `14 joueurs pris avant J1 &middot; ${frNum(DT.cost, decOf(DT.cost))} M€ sur ${frNum(DT.budget)} &middot; max ${3} par club`)}
  ${court("D", DT_STARTERS, 200)}
  <div class="cmps">
    ${cmpBar("L'équipe parfaite", DT.points, "gold", 1900)}
    ${DT.vsLeader ? cmpBar(`Le n°1 (${esc(DT.vsLeader.manager)})`, DT.vsLeader.points, "teal", 2300) : ""}
    ${cmpBar("Le manager moyen", DT.vsAverage, "grey", 2700)}
  </div>
`, "bg-rad pitchwrap");

// ========== 13. CLASSEMENT GÉNÉRAL ==========
const mgrRows = F.managerStandings.rows.slice(0, 5).map((r, i) => {
  const delta = r.rankBefore != null ? r.rankBefore - r.rankAfter : null;
  const dTxt = delta === null ? "NOUVEAU" : delta > 0 ? `&#9650; ${delta}` : delta < 0 ? `&#9660; ${-delta}` : "&#8212;";
  const dCol = delta === null ? "#2DD4BF" : delta > 0 ? "#34D399" : delta < 0 ? "#F87171" : "#64748B";
  return A(i % 2 ? "right" : "left", 250 + i * 110, `<div class="grow${i === 0 ? " first" : ""}">
    <span class="gr">${r.rankAfter}</span>
    <span class="gn"><b>${esc(r.userName ?? r.teamName)}</b><em>${r.leagueName ? `ligue ${esc(r.leagueName)} &middot; ` : ""}${frNum(r.avgPerGw, 1)} pts/journée</em></span>
    <span class="gd" style="color:${dCol}">${dTxt}</span>
    <span class="gp">${cnt(r.cumPoints, 350 + i * 110, { dur: 800 })}</span>
  </div>`);
}).join("");
const climb = R.biggestClimber;
scene("general", 4800, `
  ${hd(EY2, `Le <b>top 5</b> général`, `évolution depuis la journée ${d.firstGameweekNumber} &middot; ${F.managerStandings.totalTeams} équipes`)}
  <div class="glist">${mgrRows}</div>
  ${climb ? A("up", 1700, `<div class="punch small">La remontada : <b>${esc(climb.manager.trim())}</b>, ${climb.from}<sup>e</sup> → ${climb.to}<sup>e</sup> (+${climb.gain} places)</div>`) : ""}
`, "bg-rad");

// ========== 14. PODIUM ==========
const POD = F.managerStandings.rows.slice(0, 3);
const podCol = (r, cls, d0, h) => r ? A("up", d0, `<div class="pod ${cls}">
  <div class="medal">${{ p1: "🥇", p2: "🥈", p3: "🥉" }[cls]}</div>
  <div class="name">${esc(r.userName ?? r.teamName)}</div>
  <div class="team">${r.leagueName ? `ligue ${esc(r.leagueName)}` : ""}</div>
  <div class="pts">${cnt(r.cumPoints, d0 + 200, { dur: 900 })}<u>pts</u></div>
  <div class="podbar" data-h="${h}" data-d="${d0 + 150}"></div>
</div>`) : "";
scene("podium", 4200, `
  ${hd(EY2, `Le <b>podium</b>`, `après ${N} journées`)}
  <div class="stand">${podCol(POD[1], "p2", 300, 260)}${podCol(POD[0], "p1", 650, 360)}${podCol(POD[2], "p3", 1000, 200)}</div>
  ${POD[0] && POD[1] ? A("up", 2000, `<div class="punch small">${frNum(Math.abs(POD[0].cumPoints - POD[1].cumPoints), 1)} pts d'écart en tête. <b>Rien n'est joué.</b></div>`) : ""}
`, "bg-rad");

// ========== 15. CLUBS DE CŒUR ==========
const CLUBS = (F.heartClubsTop5 ?? []).slice(0, 5);
const clubRows = CLUBS.map((c, i) => {
  const lg = clubLogoDataUri[c.name];
  return A(i % 2 ? "right" : "left", 250 + i * 110, `<div class="krow${i === 0 ? " first" : ""}">
    <span class="gr">${c.rank}</span><span class="kb">${lg ? `<img src="${lg}"/>` : `<span>${esc(c.name).charAt(0)}</span>`}</span>
    <span class="gn"><b>${esc(shortClubName(c.name))}</b><em>${esc(c.city ?? "")}${c.managers > 1 ? ` &middot; ${c.managers} managers` : ""}</em></span>
    <span class="gp">${cnt(c.points, 350 + i * 110, { dur: 800, dec: 1 })}</span>
  </div>`);
}).join("");
const mapPoints = CLUBS.filter((c) => c.lat != null && c.lon != null).map((c) => ({ lat: c.lat, lon: c.lon, rank: c.rank }));
const topLeague = (F.bestLeagues ?? [])[0];
scene("clubs", 5800, `
  ${hd(EY2, `Les clubs de <b>cœur</b>`, `clubs d'origine des managers &middot; points cumulés`)}
  <div class="glist">${clubRows}</div>
  <div class="a map" data-fx="zoom" data-d="1000" id="clubsMap"></div>
  ${topLeague ? A("up", 1800, `<div class="punch small">Meilleure ligue : <b>${esc(topLeague.name)}</b> &middot; ${frNum(topLeague.avgPoints, 1)} pts par équipe</div>`) : ""}
`, "bg-rad");

// ========== 15bis. REJOINS LA COURSE (points d'accueil) ==========
const J = R.join;
if (J && J.total > 0) {
  const dl = J.nextGameweek?.deadlineAt
    ? new Date(J.nextGameweek.deadlineAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).replace(":", "h").replace(/\b1 /, "1er ")
    : null;
  scene("join", 6200, `
    ${hd(EY2, `Et <b>toi</b> ?`, `rejoins la course, il n'est pas trop tard`)}
    ${A("zoom", 350, `<div class="jbig">+${cnt(J.total, 400, { dur: 1300, dec: 1 })}<u>pts</u></div>`)}
    ${A("up", 800, `<div class="jsub">offerts dès ton inscription</div>`)}
    <div class="jchips">${J.perGameweek.map((c, i) => A("pop", 1100 + i * 120, `<div class="jchip"><span>J${c.gw}</span><b>+${frNum(c.credit, decOf(c.credit))}</b></div>`)).join("")}</div>
    ${A("up", 1800, `<div class="punch small">Tu démarres directement <b>${J.rank}<sup>e</sup> sur ${J.teams}</b><br/>devant ${J.ahead} managers déjà en jeu</div>`)}
    ${dl ? A("up", 2300, `<div class="jdl">⏰ avant la J${J.nextGameweek.number} &middot; ${esc(dl)}</div>`) : ""}
    ${A("pop", 2700, `<div class="jcta">starliguefantasy.fr</div>`)}
  `, "bg-rad");
}

// ========== 16. OUTRO ==========
const alphaClubs = ["MHB", "USAM", "LIMOGES", "CCMHB", "SAHB", "TREMBLAY", "CRMHB", "HBCN", "SARAN", "PAUC", "CSMBH", "SRVH", "CAEN", "FENIX", "USDK", "PSG"];
scene("outro", 3400, `
  <div class="outro-in">
    ${A("pop", 100, `<div class="h1 big">Il reste <b>${Math.max(0, 30 - d.lastGameweekNumber)}</b> journées</div>`)}
    ${A("up", 500, `<div class="sub2 big">tout peut encore basculer</div>`)}
    ${A("zoom", 900, `<div class="brandbig">Starligue <b>Fantasy</b></div>`)}
    ${A("up", 1200, `<div class="url">starliguefantasy.fr</div>`)}
    ${A("up", 1400, `<div class="grid">${alphaClubs.map((sn) => `<img src="${clubLogo(sn)}"/>`).join("")}</div>`)}
  </div>`, "bg-intro");

// ---------- timeline ----------
let acc = 0;
const timeline = scenes.map((s) => { const w = { id: s.id, start: acc, end: acc + s.dur }; acc += s.dur; return w; });
const TOTAL = acc;

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@500;600;700&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden;background:#0E1116}
#stage{position:absolute;inset:0;font-family:"Inter",system-ui,sans-serif;color:#F1F5F9;background:#0E1116}
.scene{position:absolute;inset:0;visibility:hidden;display:flex;flex-direction:column;justify-content:center;padding:70px 56px}
.a{will-change:transform,opacity;opacity:0}
.bg-rad{background:radial-gradient(ellipse 90% 34% at 50% 4%,rgba(45,212,191,.16),transparent 60%),radial-gradient(ellipse 70% 40% at 92% 100%,rgba(245,158,11,.12),transparent 60%),#0E1116}
.bg-intro{background:radial-gradient(circle at 50% 32%,rgba(45,212,191,.2),transparent 54%),radial-gradient(circle at 84% 92%,rgba(245,158,11,.16),transparent 46%),#0B0F16;align-items:center;text-align:center}
.ey{font-family:"Barlow Condensed";font-weight:700;font-size:25px;letter-spacing:.34em;text-transform:uppercase;color:#2DD4BF}
.h1{font-family:"Barlow Condensed";font-weight:800;font-size:92px;line-height:.9;text-transform:uppercase;letter-spacing:-.01em}
.h1 b{color:#F59E0B}
.h1.big{font-size:130px}
.sub2{font-weight:500;font-size:24px;color:#94A3B8;margin-top:8px}
.sub2.big{font-size:34px;margin-top:18px}
.hd{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;margin-bottom:46px}
.punch{margin-top:44px;text-align:center;font-family:"Barlow Condensed";font-weight:700;font-size:46px;text-transform:uppercase;letter-spacing:.01em;color:#E2E8F0;line-height:1.05}
.punch b{color:#F59E0B}
.punch.small{font-size:36px;margin-top:34px}
.cnt{font-variant-numeric:tabular-nums}
/* intro / outro */
.intro-in,.outro-in{display:flex;flex-direction:column;align-items:center;gap:6px}
.mega{font-family:"Barlow Condensed";font-weight:800;font-size:520px;line-height:.8;color:#F59E0B;text-shadow:0 0 80px rgba(245,158,11,.35)}
.brandbig{margin-top:60px;font-family:"Barlow Condensed";font-weight:800;font-size:96px;text-transform:uppercase}
.brandbig b{color:#2DD4BF}
.url{font-family:"Barlow Condensed";font-weight:700;font-size:36px;letter-spacing:.14em;color:#2DD4BF;margin-top:8px}
.outro-in .grid{margin-top:70px;display:grid;grid-template-columns:repeat(8,78px);gap:22px 24px;opacity:.55}
.outro-in .grid img{width:78px;height:78px;object-fit:contain;filter:drop-shadow(0 0 2px rgba(255,255,255,.7))}
/* tuiles chiffres */
.tiles{display:grid;grid-template-columns:1fr 1fr;gap:26px}
.tile{height:250px;border-radius:26px;background:linear-gradient(140deg,rgba(255,255,255,.06),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.09);
  display:flex;flex-direction:column;justify-content:center;padding:0 36px}
.tile.hot{border-color:rgba(245,158,11,.45);background:linear-gradient(140deg,rgba(245,158,11,.16),rgba(255,255,255,.02))}
.tv{font-family:"Barlow Condensed";font-weight:800;font-size:128px;line-height:.85;color:#F1F5F9}
.tile.hot .tv{color:#F59E0B}
.tv u{text-decoration:none;font-size:70px;color:#94A3B8;margin-left:4px}
.tl{margin-top:14px;font-family:"Barlow Condensed";font-weight:700;font-size:30px;letter-spacing:.06em;text-transform:uppercase;color:#94A3B8}
/* matchs */
.mcards{display:flex;flex-direction:column;gap:40px}
.mcard{border-radius:28px;padding:36px 40px;background:linear-gradient(140deg,rgba(255,255,255,.06),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.1)}
.mtag{font-family:"Barlow Condensed";font-weight:800;font-size:44px;text-transform:uppercase;color:#F59E0B;text-align:center}
.mrow{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;margin-top:26px}
.mclub{display:flex;flex-direction:column;align-items:center;gap:12px;font-family:"Barlow Condensed";font-weight:800;font-size:40px}
.mscore{font-family:"Barlow Condensed";font-weight:800;font-size:150px;line-height:.9;display:flex;gap:18px}
.mscore i{font-style:normal;color:#475569}
.mnote{text-align:center;margin-top:18px;font-family:"Barlow Condensed";font-weight:700;font-size:32px;letter-spacing:.06em;text-transform:uppercase;color:#94A3B8}
.lg{object-fit:contain}
/* classement starligue */
.stable{display:flex;flex-direction:column;gap:7px}
.srow{display:grid;grid-template-columns:56px 46px 1fr 170px 90px 70px;align-items:center;column-gap:16px;height:72px;border-radius:14px;padding:0 24px}
.sr{font-family:"Barlow Condensed";font-weight:800;font-size:34px;color:#CBD5E1}
.sn{font-family:"Barlow Condensed";font-weight:800;font-size:38px;display:flex;align-items:center;gap:14px}
.tg{font-style:normal;font-family:"Inter";font-weight:700;font-size:15px;letter-spacing:.06em;text-transform:uppercase;padding:4px 10px;border-radius:99px}
.tg.ok{background:#34D39933;color:#34D399}.tg.ko{background:#F8717133;color:#F87171}
.sv{font-family:"Barlow Condensed";font-weight:600;font-size:26px;color:#94A3B8;text-align:right}
.sga{font-family:"Barlow Condensed";font-weight:700;font-size:28px;color:#94A3B8;text-align:right}
.sp{font-family:"Barlow Condensed";font-weight:800;font-size:44px;color:#F59E0B;text-align:right}
/* leaders */
.lblocks{display:flex;flex-direction:column;gap:30px}
.lblock{border-radius:24px;padding:22px 30px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08)}
.lt{font-family:"Barlow Condensed";font-weight:800;font-size:36px;text-transform:uppercase;color:#2DD4BF;margin-bottom:10px}
.lrow{display:grid;grid-template-columns:40px auto 1fr auto;align-items:center;column-gap:18px;padding:6px 0}
.lr{font-family:"Barlow Condensed";font-weight:800;font-size:32px;color:#475569}
.lrow.first .lr{color:#F59E0B}
.ln{display:flex;flex-direction:column;min-width:0}
.ln b{font-family:"Barlow Condensed";font-weight:800;font-size:38px;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lrow.first .ln b{font-size:46px}
.ln em{font-style:normal;font-size:18px;color:#64748B}
.lv{font-family:"Barlow Condensed";font-weight:800;font-size:54px;color:#F1F5F9;text-align:right;line-height:.9}
.lrow.first .lv{color:#F59E0B;font-size:66px}
.lv u{display:block;text-decoration:none;font-size:17px;color:#64748B;letter-spacing:.06em}
.face{display:inline-block;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,rgba(45,212,191,.5),rgba(14,17,22,.7));flex:none}
.face img{width:100%;height:140%;object-fit:cover;object-position:center top;transform:translateY(-4%)}
/* terrain */
.pitchwrap{padding:50px 40px}
.court{position:relative;width:960px;margin:0 auto;border:1px solid rgba(45,212,191,.3);background:#0A1710;overflow:hidden;
  box-shadow:0 0 24px rgba(45,212,191,.15);clip-path:polygon(18px 0,100% 0,100% calc(100% - 18px),calc(100% - 18px) 100%,0 100%,0 18px)}
.court svg{display:block;width:100%}
.court .overlay{position:absolute;inset:0}
.pp{position:absolute;transform:translateX(-50%);aspect-ratio:2/3}
.pp img{width:100%;height:100%;object-fit:contain;object-position:bottom}
.pb{position:absolute;transform:translate(-50%,-50%);aspect-ratio:1/1;border-radius:50%;overflow:hidden}
.pb img{width:100%;height:100%;object-fit:contain}
.pv{position:absolute;transform:translate(-50%,-50%);aspect-ratio:1/1;border:2px solid;border-radius:50%;background:#0E1116;
  display:flex;align-items:center;justify-content:center;font-family:"Barlow Condensed";font-weight:800;font-size:25px;line-height:1}
.po{position:absolute;transform:translate(-50%,-50%);aspect-ratio:1/1;border:1.5px solid rgba(148,163,184,.55);border-radius:50%;background:#0E1116dd;
  display:flex;align-items:center;justify-content:center;font-family:"Barlow Condensed";font-weight:700;font-size:17px;line-height:1;color:#CBD5E1}
/* perfs */
.plist{display:flex;flex-direction:column;gap:20px}
.prow{display:grid;grid-template-columns:50px auto 1fr auto;align-items:center;column-gap:24px;height:210px;padding:0 34px;border-radius:24px;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)}
.prow.first{border-color:rgba(245,158,11,.4);background:linear-gradient(120deg,rgba(245,158,11,.14),rgba(255,255,255,.02))}
.pr{font-family:"Barlow Condensed";font-weight:800;font-size:48px;color:#475569}
.prow.first .pr{color:#F59E0B}
.pn{display:flex;flex-direction:column;gap:6px;min-width:0}
.pn b{font-family:"Barlow Condensed";font-weight:800;font-size:48px;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pn em{font-style:normal;font-family:"Barlow Condensed";font-weight:700;font-size:26px;color:#94A3B8;text-transform:uppercase;letter-spacing:.02em}
.pn em i{font-style:normal}
.pn em.own{font-family:"Inter";font-weight:600;font-size:19px;text-transform:none;color:#2DD4BF;letter-spacing:0}
.pp2{font-family:"Barlow Condensed";font-weight:800;font-size:80px;color:#F59E0B;line-height:.85;text-align:right}
.pp2 u,.bpts u,.recnum u{display:block;text-decoration:none;font-size:20px;color:#64748B;letter-spacing:.06em}
/* grandes cartes joueur */
.bcards{display:flex;flex-direction:column;gap:30px}
.bcard{display:grid;grid-template-columns:auto 1fr auto;align-items:center;column-gap:30px;padding:34px 40px;border-radius:30px;
  background:linear-gradient(130deg,rgba(255,255,255,.06),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.1)}
.bcard.neg{border-color:rgba(248,113,113,.45);background:linear-gradient(130deg,rgba(248,113,113,.14),rgba(255,255,255,.02))}
.bcard.pos{border-color:rgba(52,211,153,.45);background:linear-gradient(130deg,rgba(52,211,153,.14),rgba(255,255,255,.02))}
.bmid{display:flex;flex-direction:column;gap:6px;min-width:0}
.bbadge{align-self:flex-start;font-family:"Barlow Condensed";font-weight:800;font-size:22px;letter-spacing:.12em;text-transform:uppercase;padding:6px 14px;border-radius:99px;background:#F59E0B;color:#0E1116}
.bname{font-family:"Barlow Condensed";font-weight:800;font-size:58px;text-transform:uppercase;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bname i{display:block;font-style:normal;font-weight:600;font-size:28px;color:#94A3B8}
.bsub{font-size:20px;color:#64748B}
.bline{font-family:"Barlow Condensed";font-weight:700;font-size:34px;text-transform:uppercase;color:#E2E8F0;margin-top:6px}
.bline b{color:#F59E0B;font-size:44px}
.bpts{font-family:"Barlow Condensed";font-weight:800;font-size:108px;line-height:.85;text-align:right}
.bcard.neg .bpts{color:#F87171}.bcard.pos .bpts{color:#34D399}
/* record */
.recnum{text-align:center;font-family:"Barlow Condensed";font-weight:800;font-size:300px;line-height:.85;color:#F59E0B;text-shadow:0 0 80px rgba(245,158,11,.35)}
.recnum u{font-size:40px}
.recwho{display:flex;flex-direction:column;align-items:center;margin-top:30px}
.recwho b{font-family:"Barlow Condensed";font-weight:800;font-size:80px;text-transform:uppercase}
.recwho em{font-style:normal;font-family:"Barlow Condensed";font-weight:700;font-size:32px;letter-spacing:.08em;text-transform:uppercase;color:#94A3B8}
.recvs{display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:50px}
.recvs>div{border-radius:24px;padding:26px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
.recvs span{font-family:"Barlow Condensed";font-weight:800;font-size:76px;line-height:.9}
.recvs em{font-style:normal;font-size:19px;color:#94A3B8}
/* équipe parfaite : barres comparatives */
.cmps{display:flex;flex-direction:column;gap:18px;margin-top:34px}
.cl{display:flex;justify-content:space-between;align-items:baseline;font-family:"Barlow Condensed";font-weight:800;text-transform:uppercase}
.cl b{font-size:32px}.cl span{font-size:48px}
.ctrack{height:22px;border-radius:11px;background:rgba(255,255,255,.07);overflow:hidden;margin-top:6px}
.bar{height:100%;width:0;border-radius:11px}
.cmp.gold .bar{background:linear-gradient(90deg,#F59E0B,#FCD34D)}.cmp.gold span{color:#F59E0B}
.cmp.teal .bar{background:linear-gradient(90deg,#2DD4BF,#5EEAD4)}.cmp.teal span{color:#2DD4BF}
.cmp.grey .bar{background:linear-gradient(90deg,#475569,#94A3B8)}.cmp.grey span{color:#94A3B8}
/* listes classement général / clubs */
.glist{display:flex;flex-direction:column;gap:14px}
.grow,.krow{display:grid;grid-template-columns:64px 1fr 110px 170px;align-items:center;column-gap:18px;height:120px;padding:0 30px;border-radius:20px;
  background:linear-gradient(120deg,rgba(255,255,255,.05),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.08)}
.krow{grid-template-columns:64px 84px 1fr 170px}
.grow.first,.krow.first{border-color:rgba(245,158,11,.4);background:linear-gradient(120deg,rgba(245,158,11,.14),rgba(255,255,255,.02))}
.gr{font-family:"Barlow Condensed";font-weight:800;font-size:54px;color:#2DD4BF}
.first .gr{color:#F59E0B}
.gn{display:flex;flex-direction:column;min-width:0}
.gn b{font-family:"Barlow Condensed";font-weight:800;font-size:42px;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gn em{font-style:normal;font-size:17px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gd{font-family:"Barlow Condensed";font-weight:800;font-size:28px;text-align:right}
.gp{font-family:"Barlow Condensed";font-weight:800;font-size:54px;color:#F59E0B;text-align:right}
.kb{width:78px;height:78px;border-radius:14px;background:#fff;overflow:hidden;display:flex;align-items:center;justify-content:center}
.kb img{width:100%;height:100%;object-fit:contain;padding:8%}
.kb span{font-family:"Barlow Condensed";font-weight:800;font-size:40px;color:#0E1116}
.map{margin-top:26px;height:420px;border-radius:20px;overflow:hidden;border:1px solid rgba(45,212,191,.25);position:relative}
.map .leaflet-container{background:#0A1116}
.map-pin{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:"Barlow Condensed";font-weight:800;font-size:18px;color:#0E1116;border:2px solid #0E1116}
/* podium */
.stand{display:flex;align-items:flex-end;justify-content:center;gap:22px;margin-top:10px}
.pod{display:flex;flex-direction:column;align-items:center;width:300px}
.pod .medal{font-size:64px;line-height:1;margin-bottom:10px}
.pod.p1 .medal{font-size:84px}
.pod .name{font-family:"Barlow Condensed";font-weight:800;font-size:36px;text-transform:uppercase;text-align:center;max-width:290px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pod.p1 .name{font-size:46px}
.pod .team{font-size:16px;color:#64748B;margin-top:4px;max-width:290px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pod .pts{margin-top:14px;font-family:"Barlow Condensed";font-weight:800;font-size:54px;color:#F59E0B;line-height:.9;text-align:center}
.pod .pts u{display:block;text-decoration:none;font-size:16px;color:#64748B}
.podbar{width:100%;height:0;border-radius:18px 18px 0 0;margin-top:20px}
.pod.p1 .podbar{background:linear-gradient(180deg,#FCD34D,#B45309)}
.pod.p2 .podbar{background:linear-gradient(180deg,#5EEAD4,#0F766E)}
.pod.p3 .podbar{background:linear-gradient(180deg,#94A3B8,#334155)}
/* écrans flash */
.flash{align-items:center;text-align:center;justify-content:center}
.flash-in{display:flex;flex-direction:column;align-items:center;gap:10px}
.fbig{font-family:"Barlow Condensed";font-weight:800;font-size:330px;line-height:.82;color:#0E1116;letter-spacing:-.02em}
.fbig u{text-decoration:none;font-size:150px}
.fl1{font-family:"Barlow Condensed";font-weight:800;font-size:64px;text-transform:uppercase;color:#0E1116;line-height:1}
.fl2{font-family:"Barlow Condensed";font-weight:700;font-size:38px;text-transform:uppercase;color:rgba(14,17,22,.75);letter-spacing:.04em}
.flash .face{border:6px solid #0E1116;margin-bottom:10px}
/* leaders top 5 */
.l5{display:flex;flex-direction:column;gap:18px}
.l5row{display:grid;grid-template-columns:56px auto 1fr auto;align-items:center;column-gap:26px;padding:22px 34px;border-radius:24px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)}
.l5row.first{border-color:rgba(245,158,11,.45);background:linear-gradient(120deg,rgba(245,158,11,.16),rgba(255,255,255,.02));padding:30px 34px}
.l5row .ln b{font-size:48px}.l5row.first .ln b{font-size:64px}
.l5row .ln em{font-size:22px}
.l5row .lv{font-size:76px}.l5row.first .lv{font-size:104px}
.l5row .lr{font-size:44px}
.l5row.first .lr{color:#F59E0B}.l5row.first .lv{color:#F59E0B}
/* top 10 joueurs */
.tlist{display:flex;flex-direction:column;gap:12px}
.trow{display:grid;grid-template-columns:54px 78px 1fr 150px;align-items:center;column-gap:18px;padding:10px 24px;border-radius:18px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07)}
.trow.first{border-color:rgba(245,158,11,.45);background:linear-gradient(120deg,rgba(245,158,11,.14),rgba(255,255,255,.02))}
.tr{font-family:"Barlow Condensed";font-weight:800;font-size:40px;color:#475569}
.trow.first .tr{color:#F59E0B}
.tmid{display:flex;flex-direction:column;gap:8px;min-width:0}
.ttop{display:flex;align-items:baseline;gap:14px;min-width:0}
.ttop b{font-family:"Barlow Condensed";font-weight:800;font-size:38px;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ttop em{font-style:normal;font-size:18px;color:#64748B;white-space:nowrap}
.ttrack{height:12px;border-radius:6px;background:rgba(255,255,255,.07);overflow:hidden}
.ttrack .bar{background:linear-gradient(90deg,#2DD4BF,#5EEAD4)}
.trow.first .ttrack .bar{background:linear-gradient(90deg,#F59E0B,#FCD34D)}
.tp{font-family:"Barlow Condensed";font-weight:800;font-size:52px;color:#F59E0B;text-align:right}
/* rejoins-nous */
.jbig{text-align:center;font-family:"Barlow Condensed";font-weight:800;font-size:250px;line-height:.85;color:#34D399;text-shadow:0 0 70px rgba(52,211,153,.35)}
.jbig u{text-decoration:none;font-size:70px;margin-left:10px}
.jsub{text-align:center;font-family:"Barlow Condensed";font-weight:700;font-size:44px;text-transform:uppercase;color:#E2E8F0;margin-top:10px}
.jchips{display:flex;justify-content:center;gap:16px;margin-top:34px}
.jchip{display:flex;flex-direction:column;align-items:center;padding:14px 22px;border-radius:18px;background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.4)}
.jchip span{font-family:"Barlow Condensed";font-weight:700;font-size:24px;color:#94A3B8}
.jchip b{font-family:"Barlow Condensed";font-weight:800;font-size:40px;color:#34D399}
.jdl{text-align:center;margin-top:26px;font-family:"Barlow Condensed";font-weight:700;font-size:34px;text-transform:uppercase;letter-spacing:.04em;color:#F59E0B}
.jcta{margin:36px auto 0;width:max-content;padding:22px 54px;border-radius:99px;background:linear-gradient(90deg,#2DD4BF,#34D399);color:#0E1116;
  font-family:"Barlow Condensed";font-weight:800;font-size:56px;letter-spacing:.04em;box-shadow:0 0 50px rgba(45,212,191,.45)}
/* habillage dynamique */
#wipe{position:absolute;top:-10%;bottom:-10%;width:70%;left:0;z-index:200;background:linear-gradient(90deg,transparent,#F59E0B 25%,#FCD34D 50%,#F59E0B 75%,transparent);transform:translateX(-200%) skewX(-18deg);opacity:.95;pointer-events:none}
#prog{position:absolute;left:0;top:0;height:8px;width:0;z-index:210;background:linear-gradient(90deg,#2DD4BF,#F59E0B)}
#act{position:absolute;top:26px;right:40px;z-index:210;font-family:"Barlow Condensed";font-weight:800;font-size:22px;letter-spacing:.2em;text-transform:uppercase;color:#475569}
</style></head><body>
<div id="stage">
${scenes.map((s) => s.html).join("\n")}
<div id="wipe"></div><div id="prog"></div><div id="act"></div>
</div>
<script>
const TL=${JSON.stringify(timeline)};
const TOTAL=${TOTAL}; window.TOTAL=TOTAL;
const PACE=${PACE};
const ACT2_FROM='game';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ph=(t,s,e)=>clamp((t-s)/(e-s),0,1);
const eOut=t=>1-Math.pow(1-t,3);
const back=t=>{const c=1.9,c3=c+1;return 1+c3*Math.pow(t-1,3)+c*Math.pow(t-1,2);};
const fr=(v,dec)=>v.toLocaleString('fr-FR',{minimumFractionDigits:dec,maximumFractionDigits:dec}).replace(/\\u202f|\\u00a0/g,' ');
const els={};
TL.forEach(w=>{const sc=document.getElementById(w.id);els[w.id]={sc,a:[...sc.querySelectorAll('.a')],cnt:[...sc.querySelectorAll('.cnt')],bar:[...sc.querySelectorAll('.bar')],pod:[...sc.querySelectorAll('.podbar')]};});
function renderScene(w,lt,dur){
  const E=els[w.id]; const out=ph(lt,dur-280,dur);
  E.a.forEach(el=>{
    const d0=+el.dataset.d||0; const p=ph(lt,d0,d0+380); const e=eOut(p), b=back(p);
    const o=e*(1-out); let tf='';
    switch(el.dataset.fx){
      case 'left': tf='translateX('+lerp(-90,0,b)+'px)'; break;
      case 'right': tf='translateX('+lerp(90,0,b)+'px)'; break;
      case 'pop': tf='scale('+lerp(.6,1,b)+')'; break;
      case 'zoom': tf='scale('+lerp(1.25,1,e)+')'; break;
      case 'slam': tf='scale('+lerp(2.1,1,b)+') rotate('+lerp(-5,0,e)+'deg)'; break;
      default: tf='translateY('+lerp(40,0,b)+'px)';
    }
    const base=el.classList.contains('pp')?'translateX(-50%) ':(el.classList.contains('pb')||el.classList.contains('pv')||el.classList.contains('po'))?'translate(-50%,-50%) ':'';
    el.style.opacity=o.toFixed(3);
    el.style.transform=base+tf+(out>0?' scale('+lerp(1,.96,out)+')':'');
  });
  E.cnt.forEach(el=>{
    const d0=+el.dataset.d, dur2=+el.dataset.dur||900, to=+el.dataset.to, dec=+el.dataset.dec;
    const v=to*eOut(ph(lt,d0,d0+dur2));
    el.textContent=(el.dataset.sign==='1'&&v>0?'+':'')+fr(v,dec);
    const q=ph(lt,d0+dur2,d0+dur2+240);
    el.style.display='inline-block';
    el.style.transform=q>0&&q<1?'scale('+(1+0.16*Math.sin(Math.PI*q)).toFixed(3)+')':'';
  });
  // secousse d'écran à l'arrivée d'un flash
  if(w.id.startsWith('f-')){ const k=ph(lt,120,520); const amp=k>0&&k<1?14*(1-k):0;
    E.sc.style.transform=amp?'translate('+(amp*Math.sin(lt*0.09)).toFixed(1)+'px,'+(amp*Math.cos(lt*0.11)).toFixed(1)+'px) scale(1.04)':''; }
  E.bar.forEach(el=>{const d0=+el.dataset.d; el.style.width=(+el.dataset.w*eOut(ph(lt,d0,d0+1000))).toFixed(1)+'%';});
  E.pod.forEach(el=>{const d0=+el.dataset.d; el.style.height=(+el.dataset.h*eOut(ph(lt,d0,d0+800))).toFixed(0)+'px';});
}
window.seek=function(t){
  t=clamp(t,0,TOTAL-1);
  let cur=TL[0];
  for(const w of TL){ const on=t>=w.start&&t<w.end; els[w.id].sc.style.visibility=on?'visible':'hidden'; if(on) cur=w; }
  renderScene(cur,(t-cur.start)/PACE,(cur.end-cur.start)/PACE);
  // balayage ambre à chaque coupe (centré sur la frontière de scène)
  const wipe=document.getElementById('wipe'); let wp=-1;
  for(const w of TL){ if(w.start===0) continue; const k=(t-(w.start-220))/440; if(k>=0&&k<=1){wp=k;break;} }
  wipe.style.transform='translateX('+(wp<0?-200:lerp(-160,230,wp))+'%) skewX(-18deg)';
  document.getElementById('prog').style.width=(t/TOTAL*100).toFixed(2)+'%';
  const act=document.getElementById('act'); const i2=TL.findIndex(w=>w.id===ACT2_FROM);
  const inAct2=t>=TL[i2].start;
  act.textContent=cur.id==='intro'||cur.id==='outro'?'':(inAct2?'2 · les managers':'1 · le terrain');
};
window.seek(0);
(function initMap(){
  if(!window.L) { window.mapReady=true; return; }
  const pts=${JSON.stringify(mapPoints)};
  if(!pts.length){ window.mapReady=true; return; }
  const map=L.map('clubsMap',{zoomControl:false,attributionControl:false,dragging:false,scrollWheelZoom:false,doubleClickZoom:false,touchZoom:false,keyboard:false});
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}',{subdomains:'abcd',maxZoom:18}).addTo(map);
  const b=[];
  pts.forEach(p=>{b.push([p.lat,p.lon]);L.marker([p.lat,p.lon],{icon:L.divIcon({className:'',html:'<div class="map-pin" style="background:'+(p.rank===1?'#F59E0B':'#2DD4BF')+'">'+p.rank+'</div>',iconSize:[36,36],iconAnchor:[18,18]})}).addTo(map);});
  map.fitBounds(b,{padding:[50,50],maxZoom:9});
  let n=0; map.eachLayer(l=>{ if(l instanceof L.TileLayer){ n++; l.on('load',()=>{ if(--n<=0) window.mapReady=true; }); } });
  setTimeout(()=>{window.mapReady=true;},6000);
})();
</script></body></html>`;

writeFileSync(join(REEL_DIR, "reel.html"), html);
console.log(`→ ${join(REEL_DIR, "reel.html")}  (${(html.length / 1024 / 1024).toFixed(1)} Mo, ${GW_LABEL}, ${(TOTAL / 1000).toFixed(1)} s)`);
console.log(timeline.map((w) => `${w.id}@${(w.start / 1000).toFixed(1)}`).join(" "));
if (!CARTO_KEY) console.warn("⚠️  NEXT_PUBLIC_CARTO_API_KEY introuvable — la carte des clubs de cœur restera vide.");
