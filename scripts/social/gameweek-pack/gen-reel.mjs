// Étape « reel » du pack : construit <outDir>/reel/reel.html (self-contained,
// window.seek(t)) à partir de <outDir>/data.json. Télécharge photos joueurs (lnh.fr)
// et écussons des clubs d'origine (FFHandball) en data URI dans <outDir>/reel/assets/.
//
//   node scripts/social/gameweek-pack/gen-reel.mjs <outDir>
//
// Actes : intro 16 logos → les matchs un par un (fiche face-à-face) → le plan des
// rencontres → le classement Starligue qui passe de J-1 (alphabétique, 0-0-0) au
// tableau de la journée en se re-triant → l'équipe type sur le terrain (port de
// HandballPitch.tsx) → les 5 meilleures perfs → le top 3 managers + la moyenne en
// pied → les clubs de cœur → plan final.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { REPO, HERE } from "./config.mjs";

const OUT_DIR = process.argv[2];
if (!OUT_DIR) {
  console.error("usage: gen-reel.mjs <outDir>");
  process.exit(1);
}
const REEL_DIR = join(OUT_DIR, "reel");
const ASSETS = join(REEL_DIR, "assets");
mkdirSync(ASSETS, { recursive: true });

const d = JSON.parse(readFileSync(join(OUT_DIR, "data.json"), "utf-8"));
const GW = d.gameweek.number;
const N = d.matches.length;
// "2026-2027" → "26·27"
const SEASON_SHORT = (() => {
  const m = String(d.season).match(/(\d{2})(\d{2}).*?(\d{2})(\d{2})/);
  return m ? `${m[2]}·${m[4]}` : String(d.season);
})();

const b64file = (p) => "data:image/png;base64," + readFileSync(p).toString("base64");
const OVR = join(HERE, "reel", "logo-overrides");
const hasOvr = (sn) => existsSync(join(OVR, sn.toLowerCase() + ".png"));
const clubLogo = (sn) => b64file(hasOvr(sn) ? join(OVR, sn.toLowerCase() + ".png") : join(REPO, "public/clubs", sn.toLowerCase() + ".png"));
const rawLogo = (sn) => b64file(join(REPO, "public/clubs", sn.toLowerCase() + ".png"));

// Couleur primaire par club (reprise du reel « 16 maillots » / programme-journée).
const COLOR = {
  MHB: "#F0801F", USAM: "#16B24E", LIMOGES: "#F5333F", CCMHB: "#4FB6F0", SAHB: "#A855F7",
  TREMBLAY: "#F5C518", CRMHB: "#E2001A", HBCN: "#00A651", SARAN: "#2E7BD6", PAUC: "#E2001A",
  CSMBH: "#FFD200", SRVH: "#E4123A", CAEN: "#E4002B", FENIX: "#5CB8E6", USDK: "#E2001A", PSG: "#E30613",
};
const colorOf = (sn) => COLOR[sn] || "#2DD4BF";
// Clubs dont le logo a besoin d'un fond blanc en petit (cf. src/components/ui/ClubLogo.tsx)
const WHITE_BG = new Set(["CRMHB", "USAM"]);

// ---- photos joueurs (téléchargées une fois, UA navigateur + Referer lnh.fr) ----
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
async function ensurePhoto(playerKey, url) {
  const f = join(ASSETS, slug(playerKey) + ".png");
  if (existsSync(f)) return f;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", Referer: "https://www.lnh.fr/" },
  });
  if (!res.ok) throw new Error(`photo ${playerKey}: HTTP ${res.status}`);
  writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  return f;
}
const photoPath = {};
const photoUnits = [
  ...d.fantasy.bestXI.map((e) => [e.lastName, e.firstName, e.photoUrl]),
  ...(d.fantasy.performances ?? []).map((p) => [p.player?.lastName, p.player?.firstName, p.player?.photoUrl]),
];
for (const [last, first, url] of photoUnits) {
  if (!url || !last) continue;
  const k = `${last} ${first}`;
  if (photoPath[k]) continue;
  try { photoPath[k] = await ensurePhoto(k, url); } catch (err) { console.warn(String(err)); }
}
const pImg = (last, first) => (photoPath[`${last} ${first}`] ? b64file(photoPath[`${last} ${first}`]) : null);

// Logos des clubs d'origine (FFHandball, .webp hotlinké) → data URI.
const clubLogoDataUri = {};
for (const c of d.homeClubRanking ?? []) {
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

// ============ données dérivées ============
const MATCHES = d.matches.map((m) => ({ h: m.home.shortName, a: m.away.shortName, hs: m.home.score, as: m.away.score }));
const STAND = d.standing.map((s) => ({ sn: s.clubShortName, rank: s.rank, pts: s.points, ga: s.goalAvg }));
const alpha = [...STAND].map((r) => r.sn).sort((a, b) => a.localeCompare(b));
for (const r of STAND) r.startIdx = alpha.indexOf(r.sn);

const XI_ORDER = ["GK", "LW", "LB", "CB", "RB", "RW", "PV"];
const XI = d.fantasy.bestXI
  .map((e) => ({ pos: e.position, first: e.firstName, last: e.lastName, sn: e.club.shortName, pts: e.points }))
  .sort((a, b) => XI_ORDER.indexOf(a.pos) - XI_ORDER.indexOf(b.pos));

const TOP = d.fantasy.topFantasy.slice(0, 3).map((t) => ({
  rank: t.rank, name: t.userName ?? t.teamName, league: t.leagueName ?? "", pts: t.gwPoints,
}));
const PERF = (d.fantasy.performances ?? []).slice(0, 5).map((p, i) => ({
  n: i + 1, first: p.player?.firstName ?? "", last: p.player?.lastName ?? "",
  sn: p.player?.club?.shortName ?? "", pts: p.points, note: p.lnhRating,
}));
const F = d.fantasy;
const CLUBS = (d.homeClubRanking ?? []).slice(0, 3);

// ============ PITCH (port de src/components/pitch/HandballPitch.tsx) ============
const COURT = 200, VIEW_TOP = 62, GOAL_DEPTH = 16, BOTTOM_PAD = 4;
const VIEW_H = COURT + GOAL_DEPTH - VIEW_TOP + BOTTOM_PAD; // 158
const PHOTO_W = 22, PHOTO_H = PHOTO_W * 1.5;
const SLOT = {
  GK: { x: 100.9, y: 198 }, PV: { x: 100.3, y: 147 }, LB: { x: 165.4, y: 93 },
  CB: { x: 99.2, y: 99 }, RB: { x: 35.6, y: 95.2 }, LW: { x: 169.1, y: 151 }, RW: { x: 29, y: 154.5 },
};
const nameFs = (n) => (n.length > 14 ? 7 : n.length > 10 ? 8 : 9);
const pct = (c, dx = 0, dy = 0) => ({ left: ((c.x + dx) / COURT) * 100, top: ((c.y + dy - VIEW_TOP) / VIEW_H) * 100 });

function namePlateSVG(cx, topY, name) {
  const label = name.toUpperCase();
  const fs = nameFs(name), padX = 3.2, padY = 2.2;
  const w = label.length * fs * 0.52 + padX * 2, h = fs + padY * 2;
  return `<rect x="${(cx - w / 2).toFixed(2)}" y="${topY.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${(h / 2).toFixed(2)}" fill="#060E0A" fill-opacity="0.82" stroke="#2DD4BF" stroke-opacity="0.24" stroke-width="0.5"/>
    <text x="${cx.toFixed(2)}" y="${(topY + h / 2 + fs * 0.34).toFixed(2)}" text-anchor="middle" fill="#F1F5F9" font-size="${fs}" font-weight="700" style="font-family:'Barlow Condensed',sans-serif;letter-spacing:.02em">${label}</text>`;
}
const pitchNamePlates = XI.filter((p) => SLOT[p.pos]).map((p) => namePlateSVG(SLOT[p.pos].x, SLOT[p.pos].y + 2, p.last)).join("\n    ");
const pitchPhotos = XI.filter((p) => SLOT[p.pos]).map((p, i) => {
  const c = SLOT[p.pos], pos = pct(c, 0, -PHOTO_H), wPct = (PHOTO_W / COURT) * 100, img = pImg(p.last, p.first);
  return `<div class="pp" id="PP${i}" style="left:${pos.left}%;top:${pos.top}%;width:${wPct}%">${img ? `<img src="${img}"/>` : ""}</div>`;
}).join("\n    ");
const pitchBadges = XI.filter((p) => SLOT[p.pos]).map((p, i) => {
  const c = SLOT[p.pos];
  const club = pct(c, PHOTO_W / 2 - 2, -3);
  const pts = pct(c, -PHOTO_W / 2 - 1, -PHOTO_H * 0.5); // buste gauche, pas sur la tête
  const badgePct = (9.5 / COURT) * 100, ptsPct = (14 / COURT) * 100;
  const white = WHITE_BG.has(p.sn), positive = p.pts >= 0;
  return `<div class="pb" id="PB${i}" style="left:${club.left}%;top:${club.top}%;width:${badgePct}%${white ? ";background:#fff" : ""}">
      <img src="${rawLogo(p.sn)}"${white ? ' style="padding:8%"' : ""}/>
    </div>
    <div class="pv" id="PV${i}" style="left:${pts.left}%;top:${pts.top}%;width:${ptsPct}%;border-color:${positive ? "#34D399" : "#F87171"};color:${positive ? "#34D399" : "#F87171"}">${p.pts}</div>`;
}).join("\n    ");
const NPITCH = XI.filter((p) => SLOT[p.pos]).length;

// ============ fragments HTML ============
const introLogos = alpha.map((sn) => `<div class="ic"><img src="${clubLogo(sn)}"/></div>`).join("");

const matchCards = MATCHES.map((m, i) => {
  const hw = m.hs > m.as, aw = m.as > m.hs;
  return `<div class="mc" id="MC${i}">
    <div class="mc-glow gh" style="background:radial-gradient(circle, ${colorOf(m.h)}55, transparent 62%)"></div>
    <div class="mc-glow ga" style="background:radial-gradient(circle, ${colorOf(m.a)}55, transparent 62%)"></div>
    <img class="mc-wm wh" src="${rawLogo(m.h)}"/>
    <img class="mc-wm wa" src="${rawLogo(m.a)}"/>
    <div class="mc-seam"></div>
    <div class="mc-sweep"></div>
    <div class="mc-edge eh" style="background:${colorOf(m.h)}"></div>
    <div class="mc-edge ea" style="background:${colorOf(m.a)}"></div>
    <div class="mc-no">Match <b>${i + 1}</b> / ${N}</div>
    <div class="mc-body">
      <div class="mc-side"><img src="${clubLogo(m.h)}"/><span class="mc-sn ${hw ? "w" : ""}">${m.h}</span></div>
      <div class="mc-score"><b class="${hw ? "w" : ""}">${m.hs}</b><i>&ndash;</i><b class="${aw ? "w" : ""}">${m.as}</b></div>
      <div class="mc-side"><img src="${clubLogo(m.a)}"/><span class="mc-sn ${aw ? "w" : ""}">${m.a}</span></div>
    </div>
    <div class="mc-final">Terminé</div>
  </div>`;
}).join("\n");

const planRows = MATCHES.map((m, i) => {
  const hw = m.hs > m.as, aw = m.as > m.hs;
  return `<div class="pr" id="PR${i}">
    <span class="pr-h ${hw ? "w" : ""}">${m.h}</span>
    <img class="pr-lg" src="${clubLogo(m.h)}"/>
    <span class="pr-sc"><b class="${hw ? "w" : ""}">${m.hs}</b><i>&ndash;</i><b class="${aw ? "w" : ""}">${m.as}</b></span>
    <img class="pr-lg" src="${clubLogo(m.a)}"/>
    <span class="pr-a ${aw ? "w" : ""}">${m.a}</span>
  </div>`;
}).join("\n");

const standRows = STAND.map((r) => `<div class="tr" id="TR${r.sn}" data-start="${r.startIdx}" data-rank="${r.rank}" data-pts="${r.pts}" data-ga="${r.ga}">
    <span class="tr-pos"></span><img class="tr-lg" src="${clubLogo(r.sn)}"/><span class="tr-sn">${r.sn}</span>
    <span class="tr-j">0</span><span class="tr-ga">0</span><span class="tr-pt">0</span>
  </div>`).join("\n");

const topRows = TOP.map((t, i) => `<div class="cr" id="CR${i}">
    <span class="cr-r">${t.rank}</span>
    <span class="cr-nm"><b>${esc(t.name)}</b>${t.league ? `<em>ligue ${esc(t.league)}</em>` : ""}</span>
    <span class="cr-pt">${t.pts.toFixed(1)}<u>pts</u></span>
  </div>`).join("\n");

const fmtN = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const perfRows = PERF.map((p, i) => {
  const img = pImg(p.last, p.first);
  return `<div class="qr" id="QR${i}">
    <span class="qr-n">${p.n}</span>
    <span class="qr-face">${img ? `<img src="${img}"/>` : ""}</span>
    <span class="qr-nm"><i>${esc(p.first)}</i><b>${esc(p.last)}</b><em>${esc(p.sn)}${p.note != null ? ` &middot; note LNH ${fmtN(p.note)}` : ""}</em></span>
    <span class="qr-pt">${fmtN(p.pts)}<u>pts</u></span>
  </div>`;
}).join("\n");

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
const shortClubName = (n) => String(n).replace(/\s+(HANDBALL|HAND|HB|HBC|HBH|H\.?B\.?|CLUB)\.?$/i, "").trim() || String(n);
const clubRows = CLUBS.map((c, i) => {
  const logo = clubLogoDataUri[c.name];
  return `<div class="cr cr-club" id="KR${i}">
    <span class="cr-r">${c.rank}</span>
    <span class="cr-badge">${logo ? `<img src="${logo}"/>` : `<span>${esc(c.name).charAt(0)}</span>`}</span>
    <span class="cr-nm"><b>${esc(shortClubName(c.name))}</b>${c.city ? `<em>${esc(c.city)}${c.managers > 1 ? ` &middot; ${c.managers} managers` : ""}</em>` : ""}</span>
    <span class="cr-pt">${c.points.toFixed(1)}<u>pts</u></span>
  </div>`;
}).join("\n");

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@500;600;700&display=swap">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden;background:#0E1116}
#stage{position:absolute;inset:0;font-family:"Inter",system-ui,sans-serif;color:#F1F5F9;background:#0E1116}
.scene{position:absolute;inset:0;display:none}
.ey{font-family:"Barlow Condensed";font-weight:700;font-size:27px;letter-spacing:.4em;text-transform:uppercase;color:#2DD4BF}
.h1{font-family:"Barlow Condensed";font-weight:800;font-size:112px;line-height:.9;text-transform:uppercase;letter-spacing:-.01em}
.h1 b{color:#F59E0B}
.sub2{font-family:"Inter";font-weight:500;font-size:22px;color:#64748B;margin-top:6px;letter-spacing:.02em}
.bg-rad{background:
  radial-gradient(ellipse 90% 34% at 50% 4%, rgba(45,212,191,.16), transparent 60%),
  radial-gradient(ellipse 70% 40% at 92% 100%, rgba(245,158,11,.12), transparent 60%), #0E1116}
#intro{z-index:80;overflow:hidden;background:radial-gradient(circle at 50% 32%, rgba(45,212,191,.18), transparent 54%),
  radial-gradient(circle at 84% 92%, rgba(245,158,11,.13), transparent 46%), #0B0F16}
#intro .ic{position:absolute;left:50%;top:46%;width:150px;height:150px;margin:-75px 0 0 -75px;will-change:transform,opacity}
#intro .ic img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 0 3px rgba(255,255,255,.9)) drop-shadow(0 0 2px rgba(255,255,255,.85)) drop-shadow(0 10px 20px rgba(0,0,0,.6))}
#intro .ttl{position:absolute;left:0;right:0;top:46%;text-align:center;transform:translateY(-50%);will-change:transform,opacity}
#intro .ttl .k{font-family:"Barlow Condensed";font-weight:700;font-size:29px;letter-spacing:.4em;text-transform:uppercase;color:#2DD4BF}
#intro .ttl .m{font-family:"Barlow Condensed";font-weight:800;font-size:180px;line-height:.86;text-transform:uppercase;margin-top:18px;letter-spacing:-.01em}
#intro .ttl .m b{color:#F59E0B}
#intro .ttl .s{margin-top:18px;font-family:"Barlow Condensed";font-weight:700;font-size:34px;letter-spacing:.16em;text-transform:uppercase;color:#94A3B8}
.mc{position:absolute;inset:0;overflow:hidden;background:radial-gradient(120% 80% at 50% 26%, #131922 0%, #0A0E15 58%, #07090F 100%)}
.mc-glow{position:absolute;top:-8%;width:1150px;height:1150px;border-radius:50%;filter:blur(4px);opacity:0;will-change:opacity}
.mc-glow.gh{left:-330px}.mc-glow.ga{right:-330px}
.mc-wm{position:absolute;top:340px;width:820px;height:820px;object-fit:contain;opacity:0;will-change:opacity}
.mc-wm.wh{left:-280px}.mc-wm.wa{right:-280px}
.mc-seam{position:absolute;inset:0;opacity:0;will-change:opacity;background:linear-gradient(103deg,transparent 46%,rgba(7,9,15,.6) 48.6%,rgba(255,255,255,.14) 50%,rgba(7,9,15,.6) 51.4%,transparent 54%)}
.mc-sweep{position:absolute;inset:-10% -40%;opacity:0;mix-blend-mode:screen;transform:translateX(-120%);will-change:transform,opacity;background:linear-gradient(103deg,transparent 46%,rgba(255,255,255,.45) 50%,transparent 54%)}
.mc-edge{position:absolute;top:770px;bottom:700px;width:6px;border-radius:4px;opacity:0;will-change:opacity;transform:scaleY(.3);transform-origin:top}
.mc-edge.eh{left:70px}.mc-edge.ea{right:70px}
.mc-no{position:absolute;top:300px;left:0;right:0;text-align:center;font-family:"Barlow Condensed";font-weight:700;font-size:30px;letter-spacing:.24em;text-transform:uppercase;color:rgba(255,255,255,.5);will-change:opacity}
.mc-no b{color:#F59E0B}
.mc-body{position:absolute;top:800px;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:26px}
.mc-side{display:flex;flex-direction:column;align-items:center;gap:26px;width:300px;will-change:opacity,transform}
.mc-side img{width:210px;height:210px;object-fit:contain;filter:drop-shadow(0 0 3px rgba(255,255,255,.95)) drop-shadow(0 0 2px rgba(255,255,255,.9)) drop-shadow(0 16px 30px rgba(0,0,0,.55))}
.mc-sn{font-family:"Barlow Condensed";font-weight:800;font-size:64px;text-transform:uppercase;color:#64748B}
.mc-sn.w{color:#F1F5F9}
.mc-score{display:flex;align-items:center;gap:20px;font-family:"Barlow Condensed";font-weight:800;font-size:150px;line-height:1;will-change:opacity,transform}
.mc-score b{color:#CBD5E1}.mc-score b.w{color:#F59E0B}
.mc-score i{font-style:normal;font-size:70px;color:#3B475A}
.mc-final{position:absolute;top:1210px;left:0;right:0;text-align:center;font-family:"Barlow Condensed";font-weight:700;font-size:28px;letter-spacing:.4em;text-transform:uppercase;color:#2DD4BF;will-change:opacity}
#plan{padding:300px 70px 300px}
#plan .hd{display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;margin-bottom:52px}
#plan .list{display:flex;flex-direction:column;gap:14px}
.pr{display:grid;grid-template-columns:1fr 76px 260px 76px 1fr;align-items:center;height:120px;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:0 34px;gap:16px;will-change:transform,opacity}
.pr-h{font-family:"Barlow Condensed";font-weight:800;font-size:46px;text-transform:uppercase;color:#64748B;text-align:right}
.pr-a{font-family:"Barlow Condensed";font-weight:800;font-size:46px;text-transform:uppercase;color:#64748B;text-align:left}
.pr-h.w,.pr-a.w{color:#F1F5F9}
.pr-lg{width:56px;height:56px;object-fit:contain}
.pr-sc{display:flex;align-items:center;justify-content:center;gap:14px;font-family:"Barlow Condensed";font-weight:800;font-size:60px}
.pr-sc b{color:#F1F5F9}.pr-sc b.w{color:#F59E0B}.pr-sc i{font-style:normal;font-size:32px;color:#475569}
#stand{padding:150px 60px 90px}
#stand .hd{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px}
#stand .flip{position:relative;height:46px;margin-top:8px;width:520px}
#stand .flip span{position:absolute;inset:0;font-family:"Barlow Condensed";font-weight:700;font-size:30px;letter-spacing:.22em;text-transform:uppercase;color:#94A3B8;text-align:center;will-change:opacity,transform}
#stand .colh{display:grid;grid-template-columns:70px 1fr 92px 110px 110px;align-items:center;padding:24px 24px 8px;font-size:18px;letter-spacing:.14em;color:#64748B;font-family:"Barlow Condensed";font-weight:700}
#stand .colh span:nth-child(3),#stand .colh span:nth-child(4){text-align:center}
#stand .colh span:nth-child(5){text-align:right}
#stand .body{position:relative;margin:0 24px;height:1120px}
.tr{position:absolute;left:0;right:0;height:70px;display:grid;grid-template-columns:70px 54px 1fr 92px 110px 110px;align-items:center;border-bottom:1px solid rgba(255,255,255,.07);will-change:transform;padding-right:4px;background:#0E1116}
.tr-pos{font-family:"Barlow Condensed";font-weight:800;font-size:34px;color:#94A3B8}
.tr-lg{width:42px;height:42px;object-fit:contain}
.tr-sn{font-family:"Barlow Condensed";font-weight:800;font-size:38px;text-transform:uppercase;color:#F1F5F9;padding-left:8px}
.tr-j,.tr-ga{text-align:center;font-size:26px;color:#94A3B8;font-variant-numeric:tabular-nums}
.tr-pt{text-align:right;font-family:"Barlow Condensed";font-weight:800;font-size:40px;color:#F59E0B;font-variant-numeric:tabular-nums}
#pitch{display:flex;flex-direction:column;justify-content:center;padding:40px 40px}
#pitch .hd{display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;margin-bottom:34px}
.court{position:relative;width:920px;margin:0 auto;border:1px solid rgba(45,212,191,.3);background:#0A1710;overflow:hidden;
  box-shadow:0 0 24px rgba(45,212,191,.15),inset 0 0 0 1px rgba(0,0,0,.4);clip-path:polygon(18px 0,100% 0,100% calc(100% - 18px),calc(100% - 18px) 100%,0 100%,0 18px)}
.court::after{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.16) 0 1px,transparent 1px 3px)}
.court svg{display:block;width:100%}
.court .overlay{position:absolute;inset:0}
.pp{position:absolute;transform:translateX(-50%);aspect-ratio:2/3}
.pp img{width:100%;height:100%;object-fit:contain;object-position:bottom}
.pb{position:absolute;transform:translate(-50%,-50%);aspect-ratio:1/1;border-radius:50%;overflow:hidden}
.pb img{width:100%;height:100%;object-fit:contain}
.pv{position:absolute;transform:translate(-50%,-50%);aspect-ratio:1/1;border:2px solid;border-radius:50%;background:#0E1116;
  display:flex;align-items:center;justify-content:center;font-family:"Barlow Condensed";font-weight:800;font-size:22px;line-height:1}
#pitch .brand{margin-top:30px;text-align:center;font-family:"Barlow Condensed";font-weight:700;font-size:24px;letter-spacing:.24em;text-transform:uppercase;color:#475569}
#pitch .brand b{color:#2DD4BF}
#perf{display:flex;flex-direction:column;justify-content:center;padding:60px 60px}
#perf .hd{display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;margin-bottom:44px}
#perf .list{display:flex;flex-direction:column;gap:16px}
.qr{display:grid;grid-template-columns:70px 108px 1fr 168px;align-items:center;height:150px;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:0 34px;gap:24px;will-change:transform,opacity}
.qr:first-child{border-color:rgba(245,158,11,.35);background:linear-gradient(120deg,rgba(245,158,11,.12),rgba(255,255,255,.02))}
.qr-n{font-family:"Barlow Condensed";font-weight:800;font-size:44px;color:#475569}
.qr:first-child .qr-n{color:#F59E0B}
.qr-face{width:108px;height:108px;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,rgba(45,212,191,.5),rgba(14,17,22,.7));flex:none}
.qr-face img{width:100%;height:150px;object-fit:cover;object-position:center top;transform:translateY(-6px)}
.qr-nm{display:flex;flex-direction:column;line-height:1.05;min-width:0}
.qr-nm i{font-family:"Barlow Condensed";font-weight:700;font-size:24px;letter-spacing:.06em;font-style:normal;text-transform:uppercase;color:#94A3B8}
.qr-nm b{font-family:"Barlow Condensed";font-weight:800;font-size:50px;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qr-nm em{font-family:"Inter";font-style:normal;font-size:20px;color:#64748B;margin-top:6px;letter-spacing:.02em}
.qr-pt{text-align:right;font-family:"Barlow Condensed";font-weight:800;font-size:60px;color:#F59E0B;line-height:.9}
.qr-pt u{display:block;text-decoration:none;font-size:20px;color:#64748B;letter-spacing:.1em}
#gc,#clubs{display:flex;flex-direction:column;justify-content:center;padding:60px 66px}
#gc .hd,#clubs .hd{display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;margin-bottom:52px}
#gc .list,#clubs .list{display:flex;flex-direction:column;gap:26px}
#gc .avg{margin-top:52px;display:flex;flex-direction:column;align-items:center;gap:6px;will-change:opacity,transform}
#gc .avg .v{font-family:"Barlow Condensed";font-weight:800;font-size:104px;line-height:.85;color:#F59E0B}
#gc .avg .l{font-family:"Barlow Condensed";font-weight:700;font-size:24px;letter-spacing:.12em;text-transform:uppercase;color:#64748B}
.cr-club{grid-template-columns:96px 116px 1fr 200px !important}
.cr-club .cr-nm b{font-size:40px}
.cr-club .cr-pt{font-size:56px}
.cr-badge{display:flex;align-items:center;justify-content:center;width:100px;height:100px;border-radius:16px;background:#fff;overflow:hidden}
.cr-badge img{width:100%;height:100%;object-fit:contain;padding:8%}
.cr-badge span{font-family:"Barlow Condensed";font-weight:800;font-size:52px;color:#0E1116}
.cr{display:grid;grid-template-columns:110px 1fr 240px;align-items:center;height:190px;
  background:linear-gradient(120deg,rgba(255,255,255,.05),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.09);border-radius:22px;padding:0 44px;will-change:transform,opacity}
.cr:first-child{border-color:rgba(245,158,11,.35);background:linear-gradient(120deg,rgba(245,158,11,.12),rgba(255,255,255,.02))}
.cr-r{font-family:"Barlow Condensed";font-weight:800;font-size:78px;color:#2DD4BF}
.cr:first-child .cr-r{color:#F59E0B}
.cr-nm{display:flex;flex-direction:column;min-width:0;line-height:1.05}
.cr-nm b{font-family:"Barlow Condensed";font-weight:800;font-size:58px;text-transform:uppercase;color:#F1F5F9;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.cr-nm em{font-family:"Inter";font-style:normal;font-size:22px;color:#64748B;margin-top:8px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.cr-pt{text-align:right;font-family:"Barlow Condensed";font-weight:800;font-size:66px;color:#F59E0B;line-height:.9}
.cr-pt u{display:block;text-decoration:none;font-size:22px;color:#64748B;letter-spacing:.1em}
#outro{z-index:90;background:radial-gradient(circle at 50% 20%, rgba(45,212,191,.2), transparent 50%),
  radial-gradient(circle at 84% 94%, rgba(245,158,11,.13), transparent 44%), #0B0F16}
#outro .box{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;will-change:opacity,transform}
#outro .w{font-family:"Barlow Condensed";font-weight:800;font-size:132px;text-transform:uppercase;line-height:.9}
#outro .w b{color:#2DD4BF}
#outro .u{margin-top:24px;font-family:"Barlow Condensed";font-weight:700;font-size:32px;letter-spacing:.12em;text-transform:uppercase;color:#94A3B8}
#outro .grid{position:absolute;left:50%;bottom:360px;transform:translateX(-50%);display:grid;grid-template-columns:repeat(8,74px);gap:20px 22px;opacity:0}
#outro .grid img{width:74px;height:74px;object-fit:contain;filter:drop-shadow(0 0 2px rgba(255,255,255,.7))}
</style></head><body>
<div id="stage">

  <div id="intro" class="scene">
    ${introLogos}
    <div class="ttl">
      <div class="k">Starligue Fantasy &middot; Daikin StarLigue ${SEASON_SHORT}</div>
      <div class="m">Journée <b>${GW}</b></div>
      <div class="s">le récap</div>
    </div>
  </div>

  ${matchCards}

  <div id="plan" class="scene bg-rad">
    <div class="hd"><div class="ey">Daikin StarLigue &middot; Journée ${GW}</div><div class="h1">Les <b>${N} rencontres</b></div></div>
    <div class="list">${planRows}</div>
  </div>

  <div id="stand" class="scene bg-rad">
    <div class="hd">
      <div class="ey">Daikin StarLigue</div>
      <div class="h1">Le <b>classement</b></div>
      <div class="flip"><span id="fl0">avant la journée ${GW}</span><span id="fl1" style="opacity:0">après la journée ${GW}</span></div>
    </div>
    <div class="colh"><span>#</span><span>Club</span><span>J</span><span>+/-</span><span>Pts</span></div>
    <div class="body" id="standBody">${standRows}</div>
  </div>

  <div id="pitch" class="scene bg-rad">
    <div class="hd"><div class="ey">Récap Fantasy &middot; Journée ${GW}</div><div class="h1">L'équipe <b>type</b></div></div>
    <div class="court">
      <svg viewBox="0 ${VIEW_TOP} ${COURT} ${VIEW_H}">
        <defs>
          <radialGradient id="cf" cx="50%" cy="15%" r="95%"><stop offset="0%" stop-color="#15291F"/><stop offset="100%" stop-color="#08140E"/></radialGradient>
          <pattern id="net" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 0 L4 4 M4 0 L0 4" stroke="#2DD4BF" stroke-width="0.4" stroke-opacity="0.35"/></pattern>
        </defs>
        <rect x="0" y="${VIEW_TOP}" width="${COURT}" height="${COURT - VIEW_TOP}" fill="url(#cf)"/>
        <rect x="0" y="${VIEW_TOP}" width="40" height="${COURT - VIEW_TOP}" fill="#fff" fill-opacity="0.012"/>
        <rect x="80" y="${VIEW_TOP}" width="40" height="${COURT - VIEW_TOP}" fill="#fff" fill-opacity="0.012"/>
        <rect x="160" y="${VIEW_TOP}" width="40" height="${COURT - VIEW_TOP}" fill="#fff" fill-opacity="0.012"/>
        <path d="M 2 ${VIEW_TOP} L 2 ${COURT - 2} L ${COURT - 2} ${COURT - 2} L ${COURT - 2} ${VIEW_TOP}" fill="none" stroke="#2DD4BF" stroke-width="1.25" stroke-opacity="0.35"/>
        <path d="M 10 ${COURT} A 90 90 0 0 1 190 ${COURT}" fill="none" stroke="#2DD4BF" stroke-width="1.25" stroke-opacity="0.4" stroke-dasharray="4 3"/>
        <path d="M 40 ${COURT} A 60 60 0 0 1 160 ${COURT} Z" fill="#2DD4BF" fill-opacity="0.07" stroke="#2DD4BF" stroke-width="1.5" stroke-opacity="0.6"/>
        <line x1="94" y1="130" x2="106" y2="130" stroke="#2DD4BF" stroke-width="1.5" stroke-opacity="0.5"/>
        <rect x="85" y="${COURT}" width="30" height="${GOAL_DEPTH}" fill="url(#net)" stroke="#2DD4BF" stroke-width="1.5" stroke-opacity="0.8"/>
        ${pitchNamePlates}
      </svg>
      <div class="overlay">
        ${pitchPhotos}
        ${pitchBadges}
      </div>
    </div>
    <div class="brand">Starligue <b>Fantasy</b> &middot; équipe type de la journée</div>
  </div>

  <div id="perf" class="scene bg-rad">
    <div class="hd"><div class="ey">Récap Fantasy &middot; Journée ${GW}</div><div class="h1">Les <b>5</b> meilleures perfs</div></div>
    <div class="list">${perfRows}</div>
  </div>

  <div id="gc" class="scene bg-rad">
    <div class="hd"><div class="ey">Récap Fantasy &middot; Journée ${GW}</div><div class="h1">Le top <b>3</b> managers</div></div>
    <div class="list">${topRows}</div>
    <div class="avg"><span class="v" id="gcAvg">0</span><span class="l">points en moyenne par équipe</span></div>
  </div>

  <div id="clubs" class="scene bg-rad">
    <div class="hd"><div class="ey">Récap Fantasy &middot; Journée ${GW}</div><div class="h1">Les clubs de <b>cœur</b></div><div class="sub2">clubs d'origine des managers &middot; points fantasy cumulés</div></div>
    <div class="list">${clubRows}</div>
  </div>

  <div id="outro" class="scene">
    <div class="box">
      <div class="w">Starligue <b>Fantasy</b></div>
      <div class="u">le récap, chaque semaine</div>
      <div class="u" style="color:#2DD4BF">starliguefantasy.fr</div>
    </div>
    <div class="grid">${alpha.map((sn) => `<img src="${clubLogo(sn)}"/>`).join("")}</div>
  </div>

</div>
<script>
const N=${N}, NPITCH=${NPITCH};
const ROWH=70, MC=1350;
const T_INTRO=2800;
const T_MATCH0=T_INTRO;
const T_MATCH_END=T_MATCH0+N*MC;
const T_PLAN=[T_MATCH_END,T_MATCH_END+3600];
const T_STAND=[T_PLAN[1],T_PLAN[1]+9600];
const T_PITCH=[T_STAND[1],T_STAND[1]+5200];
const T_PERF=[T_PITCH[1],T_PITCH[1]+4800];
const T_GC=[T_PERF[1],T_PERF[1]+6000];
const T_CLUBS=[T_GC[1],T_GC[1]+4400];
const T_OUTRO=[T_CLUBS[1],T_CLUBS[1]+4400];
const TOTAL=T_OUTRO[1];
window.TOTAL=TOTAL;

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ph=(t,s,e)=>clamp((t-s)/(e-s),0,1);
const eOut=t=>1-Math.pow(1-t,3);
const eOut4=t=>1-Math.pow(1-t,4);
const eInOut=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const back=t=>{const c=1.7,c3=c+1;return 1+c3*Math.pow(t-1,3)+c*Math.pow(t-1,2);};
const $=id=>document.getElementById(id);
const FLEX=new Set(['pitch','perf','gc','clubs']);
const show=(id,on)=>{$(id).style.display=on?(FLEX.has(id)?'flex':'block'):'none';};

function seekIntro(t){
  const box=$('intro'), ics=box.querySelectorAll('.ic'), ttl=box.querySelector('.ttl');
  const M=ics.length, cy=1920*0.46;
  const gather=eInOut(ph(t,700,1300));
  const spin=ph(t,200,1200)*Math.PI*0.5;
  const gridOut=ph(t,1520,1900);
  const tIn=ph(t,1880,2320), tOut=ph(t,T_INTRO-260,T_INTRO+10);
  ics.forEach((el,i)=>{
    const col=i%4,row=(i/4|0), gx=(col-1.5)*198, gy=(row-1.5)*198;
    const a=(i/M)*Math.PI*2 - Math.PI/2 + spin;
    const inT=eOut(ph(t,20+i*20,20+i*20+340));
    const rr=lerp(620,160,inT);
    const sx=lerp(Math.cos(a)*rr,gx,gather), sy=lerp(Math.sin(a)*rr,gy,gather);
    el.style.left='50%';el.style.top=cy+'px';
    el.style.transform='translate('+sx.toFixed(1)+'px,'+(sy+gridOut*-280).toFixed(1)+'px) scale('+(lerp(.14,1,inT)*lerp(1,.48,gridOut)).toFixed(3)+')';
    el.style.opacity=(inT*(1-gridOut)).toFixed(3);
  });
  ttl.style.top=cy+'px';
  ttl.style.opacity=(eOut(tIn)*(1-tOut)).toFixed(3);
  ttl.style.transform='translateY(-50%) scale('+(lerp(.82,1,back(clamp(tIn,0,1)))*lerp(1,1.06,tOut)).toFixed(3)+')';
}

function seekMatch(idx,lt){
  const M=$('MC'+idx);
  const outp=ph(lt,MC-260,MC);
  const wipe=eOut4(ph(lt,0,300));
  M.style.clipPath='inset(0 '+((1-wipe)*100).toFixed(2)+'% 0 0)';
  const sw=ph(lt,40,520), sweep=M.querySelector('.mc-sweep');
  sweep.style.transform='translateX('+lerp(-120,120,eOut(sw))+'%)';
  sweep.style.opacity=(Math.sin(sw*Math.PI)*0.85).toFixed(3);
  const gi=eOut(ph(lt,80,440))*(1-outp);
  M.querySelector('.mc-glow.gh').style.opacity=gi.toFixed(3);
  M.querySelector('.mc-glow.ga').style.opacity=gi.toFixed(3);
  M.querySelector('.mc-wm.wh').style.opacity=(eOut(ph(lt,120,520))*0.08*(1-outp)).toFixed(3);
  M.querySelector('.mc-wm.wa').style.opacity=(eOut(ph(lt,120,520))*0.08*(1-outp)).toFixed(3);
  M.querySelector('.mc-seam').style.opacity=(eOut(ph(lt,120,400))*(1-outp)).toFixed(3);
  const eg=ph(lt,180,520);
  for(const e of M.querySelectorAll('.mc-edge')){e.style.opacity=(eOut(eg)*(1-outp)).toFixed(3);e.style.transform='scaleY('+lerp(.3,1,eOut(eg))+')';}
  M.querySelector('.mc-no').style.opacity=(eOut(ph(lt,200,520))*(1-outp)).toFixed(3);
  const sides=M.querySelectorAll('.mc-side');
  const si=ph(lt,140,540);
  sides[0].style.opacity=(clamp(lt/160,0,1)*(1-outp)).toFixed(3);
  sides[0].style.transform='translateX('+lerp(-70,0,back(clamp(si,0,1)))+'px)';
  sides[1].style.opacity=(clamp(lt/160,0,1)*(1-outp)).toFixed(3);
  sides[1].style.transform='translateX('+lerp(70,0,back(clamp(si,0,1)))+'px)';
  const sc=M.querySelector('.mc-score'), scin=ph(lt,340,640);
  sc.style.opacity=(eOut(scin)*(1-outp)).toFixed(3);
  sc.style.transform='scale('+lerp(1.6,1,back(clamp(scin,0,1)))+')';
  M.querySelector('.mc-final').style.opacity=(eOut(ph(lt,560,860))*(1-outp)).toFixed(3);
}

function panelList(id,win,t,rowsSel,stag){
  const lt=t-win[0];
  const inn=eOut(ph(lt,50,440));
  const out=ph(lt,win[1]-win[0]-320,win[1]-win[0]);
  const sc=$(id);
  const hd=sc.querySelector('.hd');
  hd.style.opacity=(inn*(1-out)).toFixed(3);
  hd.style.transform='translateY('+lerp(-18,0,inn)+'px)';
  sc.querySelectorAll(rowsSel).forEach((r,i)=>{
    const a=eOut(ph(lt,150+i*(stag||70),150+i*(stag||70)+440))*(1-out);
    r.style.opacity=a.toFixed(3);
    r.style.transform='translateX('+lerp(i%2?36:-36,0,back(clamp(a,0,1)))+'px)';
  });
  const br=sc.querySelector('.brand'); if(br) br.style.opacity=(inn*(1-out)*.9).toFixed(3);
}

function seekStand(t){
  const lt=t-T_STAND[0];
  const flip=ph(lt,2000,2400);
  $('fl0').style.opacity=(1-flip).toFixed(3);
  $('fl1').style.opacity=flip.toFixed(3);
  $('fl0').style.transform='translateY('+(-flip*14)+'px)';
  $('fl1').style.transform='translateY('+((1-flip)*14)+'px)';
  const countP=ph(lt,2350,4300), cp=eOut(countP);
  document.querySelectorAll('#standBody .tr').forEach((r)=>{
    const start=+r.dataset.start, rank=+r.dataset.rank, pts=+r.dataset.pts, ga=+r.dataset.ga;
    const appear=eOut(ph(lt,120+start*44,120+start*44+440));
    const s0=2450+start*80, sortP=eInOut(ph(lt,s0,s0+1000));
    r.style.transform='translateY('+lerp(start*ROWH,(rank-1)*ROWH,sortP).toFixed(1)+'px) scale('+lerp(1,1.02,Math.sin(sortP*Math.PI)*0.5).toFixed(3)+')';
    r.style.opacity=appear.toFixed(3);
    r.style.zIndex=String(100-rank);
    r.style.boxShadow=(sortP>0.02&&sortP<0.98)?'0 18px 40px rgba(0,0,0,.55)':'none';
    r.querySelector('.tr-j').textContent=countP>0?'1':'0';
    const gv=Math.round(lerp(0,ga,cp));
    r.querySelector('.tr-ga').textContent=(gv>0?'+':'')+gv;
    r.querySelector('.tr-pt').textContent=Math.round(lerp(0,pts,cp));
    const rr=r.querySelector('.tr-pos'), landed=ph(lt,s0+700,s0+1000);
    rr.textContent=flip>0.5?String(rank):'–';
    rr.style.opacity=(flip<0.5?0.35:lerp(0.35,1,landed)).toFixed(2);
    rr.style.color=(flip>0.5&&rank===1)?'#F59E0B':(flip>0.5&&rank>=${d.standing.length - 1})?'#F87171':'#94A3B8';
  });
}

function seekPitch(t){
  const lt=t-T_PITCH[0];
  const inn=eOut(ph(lt,50,440));
  const out=ph(lt,T_PITCH[1]-T_PITCH[0]-320,T_PITCH[1]-T_PITCH[0]);
  const sc=$('pitch');
  sc.querySelector('.hd').style.opacity=(inn*(1-out)).toFixed(3);
  const court=sc.querySelector('.court');
  const ci=eOut(ph(lt,120,620));
  court.style.opacity=(ci*(1-out)).toFixed(3);
  court.style.transform='scale('+lerp(.94,1,ci)+')';
  for(let i=0;i<NPITCH;i++){
    const a=eOut(ph(lt,420+i*130,420+i*130+420))*(1-out);
    const pp=$('PP'+i), pb=$('PB'+i), pv=$('PV'+i);
    if(pp){pp.style.opacity=a.toFixed(3);pp.style.transform='translateX(-50%) translateY('+lerp(16,0,a)+'px)';}
    if(pb) pb.style.opacity=a.toFixed(3);
    if(pv) pv.style.opacity=a.toFixed(3);
  }
  sc.querySelector('.brand').style.opacity=(inn*(1-out)*.9).toFixed(3);
}

function seekGc(t){
  const lt=t-T_GC[0];
  const out=ph(lt,T_GC[1]-T_GC[0]-320,T_GC[1]-T_GC[0]);
  panelList('gc',T_GC,t,'.cr',120);
  const avg=$('gc').querySelector('.avg');
  const ai=eOut(ph(lt,1600,2100));
  avg.style.opacity=(ai*(1-out)).toFixed(3);
  avg.style.transform='translateY('+lerp(24,0,ai)+'px)';
  $('gcAvg').textContent=(lerp(0,${F.avgGwPoints},eOut(ph(lt,1700,2600)))).toFixed(1);
}

window.seek=function(t){
  t=clamp(t,0,TOTAL-1);
  ['intro','plan','stand','pitch','perf','gc','clubs','outro'].forEach((id)=>show(id,false));
  for(let i=0;i<N;i++) $('MC'+i).style.display='none';

  if(t<T_INTRO+30){ show('intro',true); seekIntro(t); return; }
  if(t<T_MATCH_END){
    const idx=Math.min(N-1,Math.floor((t-T_MATCH0)/MC));
    $('MC'+idx).style.display='block';
    seekMatch(idx,t-(T_MATCH0+idx*MC));
    return;
  }
  if(t<T_PLAN[1]){ show('plan',true); panelList('plan',T_PLAN,t,'.pr',80); return; }
  if(t<T_STAND[1]){ show('stand',true); seekStand(t); return; }
  if(t<T_PITCH[1]){ show('pitch',true); seekPitch(t); return; }
  if(t<T_PERF[1]){ show('perf',true); panelList('perf',T_PERF,t,'.qr',90); return; }
  if(t<T_GC[1]){ show('gc',true); seekGc(t); return; }
  if(t<T_CLUBS[1]){ show('clubs',true); panelList('clubs',T_CLUBS,t,'.cr',120); return; }

  show('outro',true);
  const ot=t-T_OUTRO[0];
  const box=$('outro').querySelector('.box');
  const inn=eOut(ph(ot,120,620));
  box.style.opacity=inn.toFixed(3);
  box.style.transform='translateY(-50%) scale('+lerp(.9,1,back(clamp(inn,0,1)))+')';
  $('outro').querySelector('.grid').style.opacity=(eOut(ph(ot,400,1100))*.5).toFixed(3);
};
window.seek(0);
</script>
</body></html>`;

writeFileSync(join(REEL_DIR, "reel.html"), html);
console.log(`→ ${join(REEL_DIR, "reel.html")}  (${(html.length / 1024 / 1024).toFixed(1)} Mo, J${GW}, ${N} matchs)`);
