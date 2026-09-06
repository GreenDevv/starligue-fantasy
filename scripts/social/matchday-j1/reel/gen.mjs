// Génère reel.html (self-contained, window.seek(t)) pour le reel « Récap Journée 1 ».
// 5 actes : intro 16 logos → les 8 scores → le classement Starligue qui bouge
// (J0 alphabétique 0-0-0 → tri animé vers le tableau J1) → récap fantasy
// (équipe type / top perfs / top 3 managers / la journée en chiffres) → plan final.
//
//   node scripts/social/matchday-j1/reel/gen.mjs
//
// Lit <scratch>/recap-reel/data.json (produit par scripts/social/matchday-j1/pull.ts,
// copié là), écrit <scratch>/recap-reel/reel.html. Télécharge les photos joueurs
// lnh.fr manquantes dans recap-reel/players/.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const SCRATCH = "/private/tmp/claude-501/-Users-tish-Projects-starligue-fantasy/864acd49-1050-43cb-9adb-5972703f0ea6/scratchpad/";
const DIR = SCRATCH + "recap-reel/";
const REPO = "/Users/tish/Projects/starligue-fantasy/";
const PLAYERS = DIR + "players/";
mkdirSync(PLAYERS, { recursive: true });

const d = JSON.parse(readFileSync(DIR + "data.json", "utf-8"));
const b64 = (p) => "data:image/png;base64," + readFileSync(p).toString("base64");
// Logos club : version recolorée (encre sombre → claire) pour USAM/Nîmes et CRMHB
// qui disparaissent sinon sur fond sombre — repli sur le logo normal si absent.
const OVR = REPO + "scripts/social/matchday-j1/reel/logo-overrides/";
const hasOvr = (sn) => existsSync(OVR + sn.toLowerCase() + ".png");
const clubLogo = (sn) => b64(hasOvr(sn) ? OVR + sn.toLowerCase() + ".png" : REPO + "public/clubs/" + sn.toLowerCase() + ".png");

// ---- photos joueurs (téléchargées une fois, UA navigateur + Referer lnh.fr) ----
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
async function ensurePhoto(playerKey, url) {
  const f = PLAYERS + slug(playerKey) + ".png";
  if (existsSync(f)) return f;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", Referer: "https://www.lnh.fr/" },
  });
  if (!res.ok) throw new Error(`photo ${playerKey}: HTTP ${res.status}`);
  writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  return f;
}
const photoUnits = [];
for (const e of d.fantasy.bestXI) if (e.photoUrl) photoUnits.push([`${e.lastName} ${e.firstName}`, e.photoUrl]);
for (const p of d.fantasy.performances) if (p.player?.photoUrl) photoUnits.push([`${p.player.lastName} ${p.player.firstName}`, p.player.photoUrl]);
const photoPath = {};
for (const [k, u] of photoUnits) {
  try { photoPath[k] = await ensurePhoto(k, u); }
  catch (err) { console.warn(String(err)); }
}
const pImg = (last, first) => {
  const k = `${last} ${first}`;
  return photoPath[k] ? b64(photoPath[k]) : null;
};

// ============ données dérivées ============
const SCORES = d.matches.map((m) => ({
  h: m.home.shortName, a: m.away.shortName, hs: m.home.score, as: m.away.score,
}));

// classement J1 (déjà rangé par rank) + index de départ = ordre alphabétique shortName
const J1 = d.standing.map((s) => ({
  sn: s.clubShortName, rank: s.rank, pts: s.points, ga: s.goalAvg, played: s.played,
}));
const alpha = [...J1].map((r) => r.sn).sort((a, b) => a.localeCompare(b));
for (const r of J1) r.startIdx = alpha.indexOf(r.sn);

const XI = d.fantasy.bestXI.map((e) => ({
  pos: e.position, first: e.firstName, last: e.lastName, sn: e.club.shortName, pts: e.points,
}));
const POS_FR = { GK: "Gardien", LW: "Ailier G.", LB: "Arrière G.", CB: "Demi-centre", RB: "Arrière D.", RW: "Ailier D.", PV: "Pivot" };
const XI_ORDER = ["GK", "LW", "LB", "CB", "RB", "RW", "PV"];
XI.sort((a, b) => XI_ORDER.indexOf(a.pos) - XI_ORDER.indexOf(b.pos));

const PERF = d.fantasy.performances.map((p, i) => ({
  n: i + 1, first: p.player?.firstName ?? "", last: p.player?.lastName ?? "", sn: p.player?.club.shortName ?? "",
  pts: p.points, note: p.lnhRating,
}));
const TOP = d.fantasy.topFantasy.slice(0, 3).map((t) => ({
  rank: t.rank, name: t.userName ?? t.teamName, league: t.leagueName ?? "", pts: t.gwPoints,
}));
const F = d.fantasy;
const BEST = d.bestClub;

// ============ fragments HTML ============
const INTRO_CLUBS = alpha; // 16 shortNames
const introLogos = INTRO_CLUBS.map((sn) => `<div class="ic"><img src="${clubLogo(sn)}"/></div>`).join("");

const scoreRows = SCORES.map((s, i) => {
  const hw = s.hs > s.as, aw = s.as > s.hs;
  return `<div class="sr" id="SR${i}">
    <span class="sr-h ${hw ? "w" : ""}">${s.h}</span>
    <span class="sr-sc"><b class="${hw ? "w" : ""}">${s.hs}</b><i>·</i><b class="${aw ? "w" : ""}">${s.as}</b></span>
    <span class="sr-a ${aw ? "w" : ""}">${s.a}</span>
  </div>`;
}).join("\n");

const standRows = J1.map((r) => `<div class="tr" id="TR${r.sn}" data-start="${r.startIdx}" data-rank="${r.rank}" data-pts="${r.pts}" data-ga="${r.ga}">
    <span class="tr-pos"></span>
    <img class="tr-lg" src="${clubLogo(r.sn)}"/>
    <span class="tr-sn">${r.sn}</span>
    <span class="tr-j">0</span>
    <span class="tr-ga">0</span>
    <span class="tr-pt">0</span>
  </div>`).join("\n");

const xiRows = XI.map((p, i) => {
  const img = pImg(p.last, p.first);
  return `<div class="xr" id="XR${i}">
    <span class="xr-pos">${POS_FR[p.pos] ?? p.pos}</span>
    <span class="xr-face">${img ? `<img src="${img}"/>` : ""}</span>
    <span class="xr-nm"><i>${p.first}</i><b>${p.last}</b></span>
    <img class="xr-lg" src="${clubLogo(p.sn)}"/>
    <span class="xr-pt">${p.pts}</span>
  </div>`;
}).join("\n");

const perfRows = PERF.map((p, i) => {
  const img = pImg(p.last, p.first);
  return `<div class="pr" id="PR${i}">
    <span class="pr-n">${p.n}</span>
    <span class="pr-face">${img ? `<img src="${img}"/>` : ""}</span>
    <span class="pr-nm"><i>${p.first}</i><b>${p.last}</b><em>${p.sn} · note LNH ${p.note}</em></span>
    <span class="pr-pt">${p.pts}<u>pts</u></span>
  </div>`;
}).join("\n");

const topRows = TOP.map((t, i) => `<div class="cr" id="CR${i}">
    <span class="cr-r">${t.rank}</span>
    <span class="cr-nm"><b>${t.name}</b>${t.league ? `<em>ligue ${t.league}</em>` : ""}</span>
    <span class="cr-pt">${t.pts.toFixed(1)}<u>pts</u></span>
  </div>`).join("\n");

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@500;600;700&display=swap">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden;background:#0E1116}
#stage{position:absolute;inset:0;font-family:"Inter",system-ui,sans-serif;color:#F1F5F9;background:#0E1116}
.BC{font-family:"Barlow Condensed","Inter",sans-serif}
.scene{position:absolute;inset:0;display:none}
.ey{font-family:"Barlow Condensed";font-weight:700;font-size:27px;letter-spacing:.4em;text-transform:uppercase;color:#2DD4BF}
.h1{font-family:"Barlow Condensed";font-weight:800;font-size:118px;line-height:.9;text-transform:uppercase;letter-spacing:-.01em}
.h1 b{color:#F59E0B}
.sub{font-family:"Barlow Condensed";font-weight:700;font-size:30px;letter-spacing:.22em;text-transform:uppercase;color:#94A3B8}
.bg-rad{background:
  radial-gradient(ellipse 90% 34% at 50% 4%, rgba(45,212,191,.16), transparent 60%),
  radial-gradient(ellipse 70% 40% at 92% 100%, rgba(245,158,11,.12), transparent 60%), #0E1116}

/* ---------- intro ---------- */
#intro{z-index:80;align-items:center;justify-content:center;text-align:center;overflow:hidden;
  background:radial-gradient(circle at 50% 32%, rgba(45,212,191,.18), transparent 54%),
    radial-gradient(circle at 84% 92%, rgba(245,158,11,.13), transparent 46%), #0B0F16}
#intro .ic{position:absolute;left:50%;top:42%;width:150px;height:150px;margin:-75px 0 0 -75px;will-change:transform,opacity}
#intro .ic img{width:100%;height:100%;object-fit:contain;
  filter:drop-shadow(0 0 3px rgba(255,255,255,.9)) drop-shadow(0 0 2px rgba(255,255,255,.85)) drop-shadow(0 10px 20px rgba(0,0,0,.6))}
#intro .ttl{position:absolute;left:0;right:0;top:42%;text-align:center;transform:translateY(-50%);will-change:transform,opacity}
#intro .ttl .k{font-family:"Barlow Condensed";font-weight:700;font-size:29px;letter-spacing:.42em;text-transform:uppercase;color:#2DD4BF}
#intro .ttl .m{font-family:"Barlow Condensed";font-weight:800;font-size:184px;line-height:.86;text-transform:uppercase;margin-top:18px;letter-spacing:-.01em}
#intro .ttl .m b{color:#F59E0B}
#intro .ttl .s{margin-top:18px;font-family:"Barlow Condensed";font-weight:700;font-size:34px;letter-spacing:.16em;text-transform:uppercase;color:#94A3B8}

/* ---------- scores ---------- */
#scores{padding:210px 70px 300px}
#scores .hd{display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;margin-bottom:56px}
#scores .list{display:flex;flex-direction:column;gap:16px}
.sr{display:grid;grid-template-columns:1fr 300px 1fr;align-items:center;height:118px;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:0 40px;will-change:transform,opacity}
.sr-h{font-family:"Barlow Condensed";font-weight:800;font-size:52px;text-transform:uppercase;color:#64748B;text-align:left}
.sr-a{font-family:"Barlow Condensed";font-weight:800;font-size:52px;text-transform:uppercase;color:#64748B;text-align:right}
.sr-h.w,.sr-a.w{color:#F1F5F9}
.sr-sc{display:flex;align-items:center;justify-content:center;gap:20px;font-family:"Barlow Condensed";font-weight:800;font-size:64px}
.sr-sc b{color:#F1F5F9}.sr-sc b.w{color:#F59E0B}.sr-sc i{font-style:normal;font-size:34px;color:#475569}

/* ---------- classement ---------- */
#stand{padding:150px 60px 90px}
#stand .hd{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px}
#stand .flip{position:relative;height:46px;margin-top:8px;width:520px}
#stand .flip span{position:absolute;inset:0;font-family:"Barlow Condensed";font-weight:700;font-size:30px;
  letter-spacing:.22em;text-transform:uppercase;color:#94A3B8;text-align:center;will-change:opacity,transform}
#stand .colh{display:grid;grid-template-columns:70px 1fr 92px 110px 110px;align-items:center;
  padding:26px 24px 10px;font-size:19px;letter-spacing:.14em;color:#64748B;font-family:"Barlow Condensed";font-weight:700}
#stand .colh span:nth-child(3),#stand .colh span:nth-child(4){text-align:center}
#stand .colh span:nth-child(5){text-align:right}
#stand .body{position:relative;margin:0 24px;height:1120px}
.tr{position:absolute;left:0;right:0;height:70px;display:grid;grid-template-columns:70px 54px 1fr 92px 110px 110px;
  align-items:center;border-bottom:1px solid rgba(255,255,255,.07);will-change:transform;padding-right:4px;
  background:#0E1116}
.tr-pos{font-family:"Barlow Condensed";font-weight:800;font-size:34px;color:#94A3B8}
.tr-lg{width:42px;height:42px;object-fit:contain}
.tr-sn{font-family:"Barlow Condensed";font-weight:800;font-size:38px;text-transform:uppercase;color:#F1F5F9;padding-left:8px}
.tr-j{text-align:center;font-size:26px;color:#94A3B8;font-variant-numeric:tabular-nums}
.tr-ga{text-align:center;font-size:26px;color:#94A3B8;font-variant-numeric:tabular-nums}
.tr-pt{text-align:right;font-family:"Barlow Condensed";font-weight:800;font-size:40px;color:#F59E0B;font-variant-numeric:tabular-nums}

/* ---------- fantasy panels ---------- */
.fp{padding:60px 66px;display:flex;flex-direction:column;justify-content:center}
.fp .hd{display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;margin-bottom:52px}
.fp .brand{position:absolute;left:0;right:0;bottom:250px;text-align:center;font-family:"Barlow Condensed";
  font-weight:700;font-size:24px;letter-spacing:.24em;text-transform:uppercase;color:#475569}
.fp .brand b{color:#2DD4BF}

#xi .list{display:flex;flex-direction:column;gap:12px}
.xr{display:grid;grid-template-columns:230px 84px 1fr 56px 116px;align-items:center;height:112px;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:0 30px;gap:20px;will-change:transform,opacity}
.xr-pos{font-family:"Barlow Condensed";font-weight:700;font-size:24px;letter-spacing:.12em;text-transform:uppercase;color:#2DD4BF}
.xr-face{width:84px;height:84px;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,rgba(45,212,191,.5),rgba(14,17,22,.7));flex:none}
.xr-face img{width:100%;height:118px;object-fit:cover;object-position:center top;transform:translateY(-4px)}
.xr-nm{display:flex;flex-direction:column;line-height:1;min-width:0}
.xr-nm i{font-family:"Barlow Condensed";font-weight:700;font-size:22px;letter-spacing:.08em;font-style:normal;text-transform:uppercase;color:#94A3B8}
.xr-nm b{font-family:"Barlow Condensed";font-weight:800;font-size:40px;letter-spacing:-.005em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xr-lg{width:46px;height:46px;object-fit:contain}
.xr-pt{text-align:right;font-family:"Barlow Condensed";font-weight:800;font-size:44px;color:#F59E0B}

#perf .list{display:flex;flex-direction:column;gap:16px}
.pr{display:grid;grid-template-columns:70px 108px 1fr 150px;align-items:center;height:150px;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:0 34px;gap:24px;will-change:transform,opacity}
.pr-n{font-family:"Barlow Condensed";font-weight:800;font-size:40px;color:#475569}
.pr-face{width:108px;height:108px;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,rgba(45,212,191,.5),rgba(14,17,22,.7));flex:none}
.pr-face img{width:100%;height:150px;object-fit:cover;object-position:center top;transform:translateY(-6px)}
.pr-nm{display:flex;flex-direction:column;line-height:1.05}
.pr-nm i{font-family:"Barlow Condensed";font-weight:700;font-size:26px;letter-spacing:.06em;font-style:normal;text-transform:uppercase;color:#94A3B8}
.pr-nm b{font-family:"Barlow Condensed";font-weight:800;font-size:52px;text-transform:uppercase}
.pr-nm em{font-family:"Inter";font-style:normal;font-size:20px;color:#64748B;margin-top:6px;letter-spacing:.02em}
.pr-pt{text-align:right;font-family:"Barlow Condensed";font-weight:800;font-size:60px;color:#F59E0B;line-height:.9}
.pr-pt u{display:block;text-decoration:none;font-size:20px;color:#64748B;letter-spacing:.1em}

#gc .list{display:flex;flex-direction:column;gap:26px}
.cr{display:grid;grid-template-columns:110px 1fr 240px;align-items:center;height:190px;
  background:linear-gradient(120deg,rgba(255,255,255,.05),rgba(255,255,255,.02));
  border:1px solid rgba(255,255,255,.09);border-radius:22px;padding:0 44px;will-change:transform,opacity}
.cr:first-child{border-color:rgba(245,158,11,.35);background:linear-gradient(120deg,rgba(245,158,11,.12),rgba(255,255,255,.02))}
.cr-r{font-family:"Barlow Condensed";font-weight:800;font-size:78px;color:#2DD4BF}
.cr:first-child .cr-r{color:#F59E0B}
.cr-nm{display:flex;flex-direction:column;min-width:0;line-height:1.05}
.cr-nm b{font-family:"Barlow Condensed";font-weight:800;font-size:58px;text-transform:uppercase;color:#F1F5F9;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.cr-nm em{font-family:"Inter";font-style:normal;font-size:22px;color:#64748B;margin-top:8px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.cr-pt{text-align:right;font-family:"Barlow Condensed";font-weight:800;font-size:66px;color:#F59E0B;line-height:.9}
.cr-pt u{display:block;text-decoration:none;font-size:22px;color:#64748B;letter-spacing:.1em}

/* ---------- chiffres ---------- */
#num{padding:210px 70px 150px}
#num .hd{display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;margin-bottom:60px}
#num .big{display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:56px;will-change:opacity,transform}
#num .big .v{font-family:"Barlow Condensed";font-weight:800;font-size:210px;line-height:.82;color:#F59E0B}
#num .big .l{font-family:"Barlow Condensed";font-weight:700;font-size:32px;letter-spacing:.16em;text-transform:uppercase;color:#94A3B8}
#num .duo{display:grid;grid-template-columns:1fr 1fr;gap:22px}
#num .cell{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:44px 30px;text-align:center;will-change:opacity,transform}
#num .cell .v{font-family:"Barlow Condensed";font-weight:800;font-size:96px;line-height:.86;color:#F1F5F9}
#num .cell .l{font-family:"Barlow Condensed";font-weight:700;font-size:24px;letter-spacing:.12em;text-transform:uppercase;color:#94A3B8;margin-top:12px}
#num .cell .club{display:flex;align-items:center;justify-content:center;gap:16px}
#num .cell .club img{width:78px;height:78px;object-fit:contain}
#num .cell .club .cn{font-family:"Barlow Condensed";font-weight:800;font-size:76px;text-transform:uppercase;color:#F1F5F9}

/* ---------- plan final ---------- */
#outro{z-index:90;align-items:center;justify-content:center;text-align:center;
  background:radial-gradient(circle at 50% 20%, rgba(45,212,191,.2), transparent 50%),
  radial-gradient(circle at 84% 94%, rgba(245,158,11,.13), transparent 44%), #0B0F16}
#outro .box{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);will-change:opacity,transform}
#outro .w{font-family:"Barlow Condensed";font-weight:800;font-size:132px;text-transform:uppercase;line-height:.9}
#outro .w b{color:#2DD4BF}
#outro .u{margin-top:26px;font-family:"Barlow Condensed";font-weight:700;font-size:34px;letter-spacing:.14em;text-transform:uppercase;color:#94A3B8}
#outro .grid{position:absolute;left:50%;bottom:360px;transform:translateX(-50%);display:grid;grid-template-columns:repeat(8,74px);gap:20px 22px;opacity:.5}
#outro .grid img{width:74px;height:74px;object-fit:contain;filter:drop-shadow(0 0 2px rgba(255,255,255,.7))}
</style></head><body>
<div id="stage">

  <div id="intro" class="scene">
    ${introLogos}
    <div class="ttl">
      <div class="k">Starligue Fantasy · Daikin StarLigue 26·27</div>
      <div class="m">Journée <b>1</b></div>
      <div class="s">le récap</div>
    </div>
  </div>

  <div id="scores" class="scene bg-rad">
    <div class="hd"><div class="ey">Daikin StarLigue · Journée 1</div><div class="h1">Les <b>résultats</b></div></div>
    <div class="list">${scoreRows}</div>
  </div>

  <div id="stand" class="scene bg-rad">
    <div class="hd">
      <div class="ey">Daikin StarLigue</div>
      <div class="h1">Le <b>classement</b></div>
      <div class="flip"><span id="fl0">avant la journée 1</span><span id="fl1" style="opacity:0">après la journée 1</span></div>
    </div>
    <div class="colh"><span>#</span><span>Club</span><span>J</span><span>+/-</span><span>Pts</span></div>
    <div class="body" id="standBody">${standRows}</div>
  </div>

  <div id="xi" class="scene fp bg-rad">
    <div class="hd"><div class="ey">Récap Fantasy · Journée 1</div><div class="h1">L'équipe <b>type</b></div></div>
    <div class="list">${xiRows}</div>
    <div class="brand">Starligue <b>Fantasy</b></div>
  </div>

  <div id="perf" class="scene fp bg-rad">
    <div class="hd"><div class="ey">Récap Fantasy · Journée 1</div><div class="h1">Les meilleures <b>perfs</b></div></div>
    <div class="list">${perfRows}</div>
    <div class="brand">Starligue <b>Fantasy</b></div>
  </div>

  <div id="gc" class="scene fp bg-rad">
    <div class="hd"><div class="ey">Récap Fantasy · Journée 1</div><div class="h1">Le top <b>3</b> managers</div></div>
    <div class="list">${topRows}</div>
    <div class="brand">Classement général · starliguefantasy.fr</div>
  </div>

  <div id="num" class="scene fp bg-rad">
    <div class="hd"><div class="ey">Récap Fantasy · Journée 1</div><div class="h1">La journée en <b>chiffres</b></div></div>
    <div class="big"><span class="v" id="numAvg">0</span><span class="l">points en moyenne par équipe</span></div>
    <div class="duo">
      <div class="cell"><div class="v" id="numMax">0</div><div class="l">meilleur score sur ${F.lineupCount} équipes</div></div>
      <div class="cell"><div class="club"><img src="${clubLogo(BEST.shortName)}"/><span class="cn">${BEST.shortName}</span></div><div class="l">meilleur club de la journée</div></div>
    </div>
    <div class="brand">Starligue <b>Fantasy</b></div>
  </div>

  <div id="outro" class="scene">
    <div class="box">
      <div class="w">Starligue <b>Fantasy</b></div>
      <div class="u">le récap arrive chaque semaine</div>
      <div class="u" style="color:#2DD4BF">starliguefantasy.fr</div>
    </div>
    <div class="grid">${INTRO_CLUBS.map((sn) => `<img src="${clubLogo(sn)}"/>`).join("")}</div>
  </div>

</div>
<script>
const ROWH=70;
const T_INTRO=3000;
const T_SCORES=[3000,9400];
const T_STAND=[9400,19000];
const T_XI=[19000,23600];
const T_PERF=[23600,28400];
const T_GC=[28400,32800];
const T_NUM=[32800,37600];
const T_OUTRO=[37600,42000];
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
const FLEX=new Set(['xi','perf','gc','num']);
const show=(id,on)=>{$(id).style.display=on?(FLEX.has(id)?'flex':'block'):'none';};
const fade=(el,o,y)=>{el.style.opacity=o.toFixed(3);if(y!==undefined)el.style.transform='translateY('+y.toFixed(1)+'px)';};

function seekScores(t){
  const lt=t-T_SCORES[0];
  for(let i=0;i<8;i++){
    const r=$('SR'+i);
    const a=eOut(ph(lt,120+i*90,120+i*90+520));
    r.style.opacity=a.toFixed(3);
    r.style.transform='translateY('+lerp(46,0,a).toFixed(1)+'px) scale('+lerp(.96,1,a).toFixed(3)+')';
  }
}

function seekStand(t){
  const lt=t-T_STAND[0];
  // bascule label « avant J1 » → « après J1 »
  const flip=ph(lt,2000,2400);
  $('fl0').style.opacity=(1-flip).toFixed(3);
  $('fl1').style.opacity=flip.toFixed(3);
  $('fl0').style.transform='translateY('+(-flip*14)+'px)';
  $('fl1').style.transform='translateY('+((1-flip)*14)+'px)';
  const countP=ph(lt,2350,4300);          // décompte des points / +-
  const cp=eOut(countP);
  document.querySelectorAll('#standBody .tr').forEach((r)=>{
    const start=+r.dataset.start, rank=+r.dataset.rank;
    const pts=+r.dataset.pts, ga=+r.dataset.ga;
    // apparition décalée par ordre alphabétique
    const appear=eOut(ph(lt,120+start*44,120+start*44+440));
    // tri : chaque ligne part l'une après l'autre (ordre alphabétique) vers son rang J1
    const s0=2450+start*80, sortP=eInOut(ph(lt,s0,s0+1000));
    const y=lerp(start*ROWH,(rank-1)*ROWH,sortP);
    r.style.transform='translateY('+y.toFixed(1)+'px) scale('+lerp(1,1.02,Math.sin(sortP*Math.PI)*0.5).toFixed(3)+')';
    r.style.opacity=appear.toFixed(3);
    r.style.zIndex=String(100-rank);
    r.style.boxShadow = (sortP>0.02&&sortP<0.98) ? '0 18px 40px rgba(0,0,0,.55)' : 'none';
    // valeurs
    r.querySelector('.tr-j').textContent = countP>0 ? '1' : '0';
    const gv=Math.round(lerp(0,ga,cp));
    r.querySelector('.tr-ga').textContent = (gv>0?'+':'')+gv;
    r.querySelector('.tr-pt').textContent = Math.round(lerp(0,pts,cp));
    // rang : « – » en J0, puis le chiffre cible dès la bascule (estompé pendant le
    // glissement, plein quand la ligne se pose)
    const rr=r.querySelector('.tr-pos');
    const landed=ph(lt,s0+700,s0+1000);
    rr.textContent = flip>0.5 ? String(rank) : '–';
    rr.style.opacity=(flip<0.5?0.35:lerp(0.35,1,landed)).toFixed(2);
    rr.style.color = (flip>0.5 && rank===1) ? '#F59E0B' : (flip>0.5 && rank>=15) ? '#F87171' : '#94A3B8';
  });
}

function panel(id,win,t,rowsSel){
  const lt=t-win[0];
  const inn=eOut(ph(lt,60,460));
  const out=ph(lt,win[1]-win[0]-360,win[1]-win[0]);
  const sc=$(id);
  sc.querySelector('.hd').style.opacity=(inn*(1-out)).toFixed(3);
  sc.querySelector('.hd').style.transform='translateY('+lerp(-20,0,inn)+'px)';
  const rows=sc.querySelectorAll(rowsSel);
  rows.forEach((r,i)=>{
    const a=eOut(ph(lt,180+i*80,180+i*80+460))*(1-out);
    r.style.opacity=a.toFixed(3);
    r.style.transform='translateX('+lerp(i%2?40:-40,0,back(clamp(a,0,1)))+'px)';
  });
  const br=sc.querySelector('.brand'); if(br){br.style.opacity=(inn*(1-out)*.9).toFixed(3);}
}

function seekNum(t){
  const lt=t-T_NUM[0];
  const out=ph(lt,T_NUM[1]-T_NUM[0]-360,T_NUM[1]-T_NUM[0]);
  const inn=eOut(ph(lt,60,420));
  const sc=$('num');
  sc.querySelector('.hd').style.opacity=(inn*(1-out)).toFixed(3);
  const big=sc.querySelector('.big');
  const bc=eOut(ph(lt,260,1200));
  fade(big,ph(lt,220,600)*(1-out),lerp(18,0,eOut(ph(lt,220,600))));
  $('numAvg').textContent=(lerp(0,${F.avgGwPoints},bc)).toFixed(1);
  const cells=sc.querySelectorAll('.cell');
  cells.forEach((c,i)=>{
    const a=eOut(ph(lt,700+i*220,700+i*220+460))*(1-out);
    c.style.opacity=a.toFixed(3);
    c.style.transform='translateY('+lerp(28,0,a)+'px)';
  });
  $('numMax').textContent=(lerp(0,${F.maxGwPoints},eOut(ph(lt,900,1700)))).toFixed(1);
  sc.querySelector('.brand').style.opacity=(inn*(1-out)*.9).toFixed(3);
}

window.seek=function(t){
  t=clamp(t,0,TOTAL-1);
  ['intro','scores','stand','xi','perf','gc','num','outro'].forEach((id)=>show(id,false));

  if(t<T_INTRO+40){
    show('intro',true);
    const box=$('intro'), ics=box.querySelectorAll('.ic'), ttl=box.querySelector('.ttl');
    const M=ics.length, cy=1920*0.46;
    const gather=eInOut(ph(t,720,1360));
    const spin=ph(t,220,1260)*Math.PI*0.5;
    const gridOut=ph(t,1640,2040);
    const tIn=ph(t,2020,2480), tOut=ph(t,T_INTRO-300,T_INTRO+10);
    ics.forEach((el,i)=>{
      const col=i%4,row=(i/4|0);
      const gx=(col-1.5)*198, gy=(row-1.5)*198;
      const a=(i/M)*Math.PI*2 - Math.PI/2 + spin;
      const inT=eOut(ph(t,20+i*22,20+i*22+360));
      const rr=lerp(620,160,inT);
      const sx=lerp(Math.cos(a)*rr,gx,gather);
      const sy=lerp(Math.sin(a)*rr,gy,gather);
      el.style.left='50%';el.style.top=cy+'px';
      el.style.transform='translate('+sx.toFixed(1)+'px,'+(sy+gridOut*-280).toFixed(1)+'px) scale('+(lerp(.14,1,inT)*lerp(1,.48,gridOut)).toFixed(3)+')';
      el.style.opacity=(inT*(1-gridOut)).toFixed(3);
    });
    ttl.style.top=cy+'px';
    ttl.style.opacity=(eOut(tIn)*(1-tOut)).toFixed(3);
    ttl.style.transform='translateY(-50%) scale('+(lerp(.82,1,back(clamp(tIn,0,1)))*lerp(1,1.06,tOut)).toFixed(3)+')';
    return;
  }

  if(t<T_SCORES[1]){ show('scores',true); seekScores(t); return; }
  if(t<T_STAND[1]){ show('stand',true); seekStand(t); return; }
  if(t<T_XI[1]){ show('xi',true); panel('xi',T_XI,t,'.xr'); return; }
  if(t<T_PERF[1]){ show('perf',true); panel('perf',T_PERF,t,'.pr'); return; }
  if(t<T_GC[1]){ show('gc',true); panel('gc',T_GC,t,'.cr'); return; }
  if(t<T_NUM[1]){ show('num',true); seekNum(t); return; }

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

writeFileSync(DIR + "reel.html", html);
console.log("reel.html:", (html.length / 1024 / 1024).toFixed(2), "Mo · TOTAL défini dans le script");
