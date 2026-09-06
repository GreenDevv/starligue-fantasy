// Étape « revue » du pack : page HTML (→ Artifact) qui rassemble les 5 posts + le
// reel + les données de contrôle, pour validation avant publication.
//   node scripts/social/gameweek-pack/gen-preview.mjs <outDir>   → écrit <outDir>/preview.html
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = process.argv[2];
if (!OUT_DIR) {
  console.error("usage: gen-preview.mjs <outDir>");
  process.exit(1);
}
const data = JSON.parse(readFileSync(join(OUT_DIR, "data.json"), "utf8"));
const GW = data.gameweek.number;
const N = data.matches.length;

const dataUri = (path, mime) => (existsSync(path) ? `data:${mime};base64,${readFileSync(path).toString("base64")}` : null);
const postUri = (name) => dataUri(join(OUT_DIR, "posts", name), "image/png");
const reelUri = dataUri(join(OUT_DIR, `reel-recap-j${GW}.mp4`), "video/mp4");

const HASHTAGS = "#StarligueFantasy #Handball #FantasyHandball #DaikinStarLigue #LNH";
const esc = (s) => String(s).replace(/</g, "&lt;");

// Faits de la journée pour les légendes (data-driven, à relire/retoucher).
const bigWin = [...data.matches].sort((a, b) => Math.abs(b.home.score - b.away.score) - Math.abs(a.home.score - a.away.score))[0];
const scorer0 = data.statLeaders.scorers.leaders[0];
const passer0 = data.statLeaders.passers.leaders[0];
const keeper0 = data.statLeaders.keepers.leaders[0];
const leader = data.standing[0];

const posts = [
  {
    file: "1-resultats.png",
    label: `Post 1 · Résultats · J${GW}`,
    caption: `📊 JOURNÉE ${GW} — tous les résultats\n\n` +
      (bigWin ? `Le carton du jour : ${bigWin.home.shortName} ${bigWin.home.score}-${bigWin.away.score} ${bigWin.away.shortName}.\n\n` : "") +
      `➡️ Compose ton équipe sur starliguefantasy.fr\n\n${HASHTAGS}`,
  },
  {
    file: "2-classement.png",
    label: `Post 2 · Classement · J${GW}`,
    caption: `🏆 Le classement Starligue après la Journée ${GW}\n\n` +
      (leader ? `${leader.clubShortName} en tête (${leader.points} pts, ${leader.goalAvg > 0 ? "+" : ""}${leader.goalAvg}).\n\n` : "") +
      HASHTAGS,
  },
  {
    file: "3-top-buteurs.png",
    label: `Post 3 · Top buteurs · J${GW}`,
    caption: `🎯 TOP BUTEURS — Journée ${GW}\n\n` +
      (scorer0 ? `${scorer0.firstName} ${scorer0.lastName} (${scorer0.club.shortName}) en patron avec ${scorer0.value} buts.\n\n` : "") +
      HASHTAGS,
  },
  {
    file: "4-top-passeurs.png",
    label: `Post 4 · Top passeurs · J${GW}`,
    caption: `🅿️ TOP PASSEURS — Journée ${GW}\n\n` +
      (passer0 ? `${passer0.firstName} ${passer0.lastName} (${passer0.club.shortName}) en tête avec ${passer0.value} dernières passes.\n\n` : "") +
      HASHTAGS,
  },
  {
    file: "5-top-gardiens.png",
    label: `Post 5 · Top gardiens · J${GW}`,
    caption: `🧤 TOP GARDIENS — Journée ${GW}\n\n` +
      (keeper0 ? `${keeper0.value} arrêts pour ${keeper0.firstName} ${keeper0.lastName} (${keeper0.club.shortName}).\n\n` : "") +
      HASHTAGS,
  },
];

const cards = posts.map((p) => {
  const uri = postUri(p.file);
  return `<article class="card">
    <div class="shot">${uri ? `<img src="${uri}" alt="${esc(p.label)}" loading="lazy"/>` : `<div class="missing">${p.file} manquant</div>`}</div>
    <div class="meta">
      <h3>${esc(p.label)}</h3>
      <label class="cap-label">Légende proposée (à relire)</label>
      <pre class="caption">${esc(p.caption)}</pre>
    </div>
  </article>`;
}).join("");

const list = (arr, f) => (arr ?? []).map(f).join("\n");
const bestXI = list(data.fantasy.bestXI, (e) => `${e.position} · ${e.firstName} ${e.lastName} (${e.club.shortName}) — ${e.points} pts`);
const perfs = list(data.fantasy.performances, (p, i) => `${i + 1}. ${p.player ? `${p.player.firstName} ${p.player.lastName}` : "?"} (${p.player?.club?.shortName ?? "?"}) — ${p.points} pts · note ${p.lnhRating}`);
const topFantasy = list(data.fantasy.topFantasy.slice(0, 3), (t) => `${t.rank}. ${t.userName ?? t.teamName} — ${t.gwPoints} pts`);
const clubsCoeur = list(data.homeClubRanking, (c) => `${c.rank}. ${c.name} — ${c.points} pts${c.managers > 1 ? ` (${c.managers} managers)` : ""}`);
const statList = (o) => (o?.leaders ?? []).slice(0, 5).map((l, i) => `${i + 1}. ${l.firstName} ${l.lastName} — ${l.value} (${l.club.shortName})`).join("\n");

const ACTS = [
  ["Intro", "les 16 logos en spirale → « JOURNÉE " + GW + " · le récap »"],
  [`Les ${N} matchs, un par un`, "fiche face-à-face : écussons + halos couleur du club + score en gros"],
  [`Le plan des ${N} rencontres`, "récap sur un écran"],
  ["Le classement bouge", `16 clubs à 0-0-0 en ordre alphabétique (« avant la J${GW} »), puis les points s'affichent et chaque ligne glisse vers son rang`],
  ["L'équipe type sur le terrain", "PitchView, écusson de club + pastille de points sur le buste"],
  ["Les 5 meilleures perfs", "liste avec photos, note LNH et points fantasy"],
  ["Le top 3 managers", `classement général + la moyenne de la journée (${data.fantasy.avgGwPoints} pts) en pied, en plus petit`],
  ["Les clubs de cœur", "top 3 du classement des clubs d'origine des managers, écussons FFHandball"],
  ["Plan final", "Starligue Fantasy + les 16 logos"],
].map(([t, d]) => `<li><b>${esc(t)}</b> — ${esc(d)}</li>`).join("\n");

const html = `<title>Pack contenu Journée ${GW}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600&display=swap">
<style>
  :root{--bg:#0e1116;--surface:#161b22;--surface-2:#1c232d;--border:rgba(255,255,255,.09);--text:#f1f5f9;--muted:#94a3b8;--teal:#2dd4bf;--amber:#f59e0b;--radius:14px}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,sans-serif;line-height:1.55}
  .wrap{max-width:1120px;margin:0 auto;padding:40px 24px 80px}
  header{border-bottom:1px solid var(--border);padding-bottom:26px;margin-bottom:34px}
  .eyebrow{font-size:13px;letter-spacing:3px;text-transform:uppercase;color:var(--amber);font-weight:600;margin:0 0 10px}
  h1{font-family:"Barlow Condensed","Inter",sans-serif;font-weight:700;font-size:clamp(34px,6vw,52px);letter-spacing:-.5px;margin:0;text-wrap:balance;text-transform:uppercase}
  h1 span{color:var(--teal)}
  .lede{color:var(--muted);max-width:62ch;margin:12px 0 0;font-size:15px}
  h2{font-family:"Barlow Condensed","Inter",sans-serif;font-weight:700;font-size:26px;letter-spacing:.3px;text-transform:uppercase;margin:46px 0 18px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:22px}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;display:flex;flex-direction:column}
  .shot{background:#000}
  .shot img{display:block;width:100%;height:auto}
  .missing{padding:40px;text-align:center;color:var(--amber);font-size:13px}
  .meta{padding:16px 18px 20px;display:flex;flex-direction:column;gap:8px}
  .meta h3{font-family:"Barlow Condensed","Inter",sans-serif;font-weight:600;font-size:19px;letter-spacing:.3px;margin:0;text-transform:uppercase}
  .cap-label{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);font-weight:600}
  .caption{font-family:Inter,sans-serif;font-size:12.5px;color:#cbd5e1;white-space:pre-wrap;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:12px 13px;margin:0;line-height:1.5}
  .panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:22px 24px}
  .cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:22px}
  .cols h4{margin:0 0 6px;font-size:13px;color:var(--teal);letter-spacing:1px;text-transform:uppercase}
  .cols pre{font-family:Inter,sans-serif;font-size:12.5px;color:#cbd5e1;white-space:pre-wrap;margin:0;font-variant-numeric:tabular-nums}
  .reel-panel{display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:26px;align-items:start}
  .reel-panel video{width:100%;border-radius:12px;background:#000;display:block}
  .acts{margin:0;padding-left:20px}
  .acts li{margin:7px 0;color:#cbd5e1;font-size:13.5px}
  .acts li b{color:var(--text)}
  @media (max-width:640px){.reel-panel{grid-template-columns:1fr}.reel-panel video{max-width:300px;margin:0 auto}}
  .foot{margin-top:40px;padding-top:20px;border-top:1px solid var(--border);color:var(--muted);font-size:13px}
  @media (prefers-color-scheme:light){:root:not([data-theme="dark"]){--bg:#f4f6f8;--surface:#fff;--surface-2:#f0f3f6;--border:rgba(15,23,42,.12);--text:#0e1116;--muted:#5b6675}}
  :root[data-theme="light"]{--bg:#f4f6f8;--surface:#fff;--surface-2:#f0f3f6;--border:rgba(15,23,42,.12);--text:#0e1116;--muted:#5b6675}
</style>

<div class="wrap">
  <header>
    <p class="eyebrow">Brouillons — à valider avant publication</p>
    <h1>Pack contenu <span>Journée ${GW}</span></h1>
    <p class="lede">5 visuels statiques (1080×1350) + le reel récap (1080×1920), générés depuis les vraies données de la prod. Rien n'est publié sur Instagram.</p>
  </header>

  <h2>Les 5 posts</h2>
  <div class="grid">${cards}</div>

  <h2>Le reel récap fantasy</h2>
  <div class="panel reel-panel">
    ${reelUri ? `<video src="${reelUri}" controls playsinline preload="metadata"></video>` : `<div class="missing">reel-recap-j${GW}.mp4 manquant</div>`}
    <div>
      <ol class="acts">${ACTS}</ol>
    </div>
  </div>

  <h2>Données de contrôle</h2>
  <div class="panel">
    <div class="cols">
      <div><h4>Équipe type</h4><pre>${esc(bestXI)}</pre></div>
      <div><h4>Top 5 perfs fantasy</h4><pre>${esc(perfs)}</pre></div>
      <div><h4>Top 3 classement général</h4><pre>${esc(topFantasy)}</pre></div>
      <div><h4>Clubs de cœur</h4><pre>${esc(clubsCoeur)}</pre></div>
      <div><h4>Repères journée</h4><pre>Moyenne : ${data.fantasy.avgGwPoints} pts
Médiane : ${data.fantasy.medianGwPoints} pts
Meilleur score : ${data.fantasy.maxGwPoints} pts
Équipes notées : ${data.fantasy.lineupCount}</pre></div>
      <div><h4>Buteurs</h4><pre>${esc(statList(data.statLeaders.scorers))}</pre></div>
      <div><h4>Passeurs</h4><pre>${esc(statList(data.statLeaders.passers))}</pre></div>
      <div><h4>Gardiens (arrêts)</h4><pre>${esc(statList(data.statLeaders.keepers))}</pre></div>
    </div>
  </div>

  <p class="foot">Généré le ${new Date(data.generatedAt).toLocaleString("fr-FR")} · saison ${esc(data.season)} · <code>scripts/social/gameweek-pack/</code></p>
</div>`;

const dest = join(OUT_DIR, "preview.html");
writeFileSync(dest, html);
console.log(`→ ${dest}  (${(html.length / 1e6).toFixed(1)} Mo)`);
