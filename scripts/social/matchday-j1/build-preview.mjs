// Assemble la page de revue (Artifact) pour le pack de contenu Journée 1 :
// les 5 visuels statiques en base64 + légendes proposées + notes/questions ouvertes.
// node scripts/social/matchday-j1/build-preview.mjs > <scratchpad>/matchday-j1-preview.html
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");
const data = JSON.parse(readFileSync(join(OUT, "data.json"), "utf8"));

const b64 = (name) => `data:image/png;base64,${readFileSync(join(OUT, name)).toString("base64")}`;

const HASHTAGS = "#StarligueFantasy #Handball #FantasyHandball #DaikinStarLigue #LNH";

const posts = [
  {
    id: "results",
    file: "results.png",
    label: "Post 1 · Résultats Starligue",
    caption:
      `📊 JOURNÉE 1 — tous les résultats\n\n` +
      `Montpellier lance idéalement sa saison (41-22 face à Chartres), le PSG s'impose à Chambéry, ` +
      `Nantes écrase Tremblay à l'extérieur… et Caen, tout juste promu, décroche sa première victoire ` +
      `dans l'élite face à Dunkerque ! 🔥\n\n` + HASHTAGS,
  },
  {
    id: "standings",
    file: "standings.png",
    label: "Post 2 · Classement Starligue",
    caption:
      `🏆 Le classement après la Journée 1\n\n` +
      `Montpellier prend la tête grâce à sa différence de buts (+19). Huit équipes à 2 points : ` +
      `tout commence.\n\n` + HASHTAGS,
  },
  {
    id: "scorer",
    file: "top-scorer.png",
    label: "Post 3 · Top buteurs",
    caption:
      `🎯 TOP BUTEURS — Journée 1\n\n` +
      `Nemanja Ilic (Fenix Toulouse) et Hugo Kamtchop Baril (USAM Nîmes) en patrons avec 10 buts chacun.\n\n` +
      HASHTAGS,
  },
  {
    id: "passer",
    file: "top-passer.png",
    label: "Post 4 · Top passeurs",
    caption:
      `🅿️ TOP PASSEURS — Journée 1\n\n` +
      `Valentin Porte (Montpellier) et Jules Lignières (Limoges) se partagent la tête avec 12 dernières passes.\n\n` +
      HASHTAGS,
  },
  {
    id: "keeper",
    file: "top-keeper.png",
    label: "Post 5 · Top gardiens",
    caption:
      `🧤 TOP GARDIENS — Journée 1\n\n` +
      `17 arrêts pour Milos Mocevic (Caen) : un festival pour son entrée en Starligue.\n\n` + HASHTAGS,
  },
];

const scorers = data.statLeaders.scorers.leaders
  .slice(0, 5)
  .map((l, i) => `${i + 1}. ${l.firstName} ${l.lastName} — ${l.value} (${l.club.shortName})`)
  .join("\n");
const passers = data.statLeaders.passers.leaders
  .slice(0, 5)
  .map((l, i) => `${i + 1}. ${l.firstName} ${l.lastName} — ${l.value} (${l.club.shortName})`)
  .join("\n");
const keepers = data.statLeaders.keepers.leaders
  .slice(0, 5)
  .map((l, i) => `${i + 1}. ${l.firstName} ${l.lastName} — ${l.value} (${l.club.shortName})`)
  .join("\n");
const bestXI = data.fantasy.bestXI
  .map((e) => `${e.position} · ${e.firstName} ${e.lastName} (${e.club.shortName}) — ${e.points} pts`)
  .join("\n");
const topFantasy = data.fantasy.topFantasy
  .map((t) => `${t.rank}. ${t.userName ?? t.teamName} — ${t.gwPoints} pts`)
  .join("\n");

const cards = posts
  .map(
    (p) => `
      <article class="card">
        <div class="shot"><img src="${b64(p.file)}" alt="${p.label}" loading="lazy" /></div>
        <div class="meta">
          <h3>${p.label}</h3>
          <label class="cap-label">Légende proposée</label>
          <pre class="caption">${p.caption.replace(/</g, "&lt;")}</pre>
        </div>
      </article>`
  )
  .join("");

const html = `<title>Pack contenu Journée 1</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600&display=swap">
<style>
  :root {
    --bg: #0e1116;
    --surface: #161b22;
    --surface-2: #1c232d;
    --border: rgba(255,255,255,0.09);
    --text: #f1f5f9;
    --muted: #94a3b8;
    --teal: #2dd4bf;
    --amber: #f59e0b;
    --radius: 14px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: Inter, system-ui, sans-serif;
    line-height: 1.55;
  }
  .wrap { max-width: 1120px; margin: 0 auto; padding: 40px 24px 80px; }
  header { border-bottom: 1px solid var(--border); padding-bottom: 26px; margin-bottom: 34px; }
  .eyebrow {
    font-size: 13px; letter-spacing: 3px; text-transform: uppercase; color: var(--amber);
    font-weight: 600; margin: 0 0 10px;
  }
  h1 {
    font-family: "Barlow Condensed", "Inter", sans-serif;
    font-weight: 700; font-size: clamp(34px, 6vw, 52px); letter-spacing: -0.5px;
    margin: 0; text-wrap: balance; text-transform: uppercase;
  }
  h1 span { color: var(--teal); }
  .lede { color: var(--muted); max-width: 62ch; margin: 12px 0 0; font-size: 15px; }
  h2 {
    font-family: "Barlow Condensed", "Inter", sans-serif;
    font-weight: 700; font-size: 26px; letter-spacing: 0.3px; text-transform: uppercase;
    margin: 46px 0 18px; color: var(--text);
  }
  .grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 22px;
  }
  .card {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    overflow: hidden; display: flex; flex-direction: column;
  }
  .shot { background: #000; }
  .shot img { display: block; width: 100%; height: auto; }
  .meta { padding: 16px 18px 20px; display: flex; flex-direction: column; gap: 8px; }
  .meta h3 {
    font-family: "Barlow Condensed", "Inter", sans-serif;
    font-weight: 600; font-size: 19px; letter-spacing: 0.3px; margin: 0; text-transform: uppercase;
  }
  .cap-label {
    font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); font-weight: 600;
  }
  .caption {
    font-family: Inter, sans-serif; font-size: 12.5px; color: #cbd5e1; white-space: pre-wrap;
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px;
    padding: 12px 13px; margin: 0; line-height: 1.5;
  }
  .panel {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 22px 24px;
  }
  .panel + .panel { margin-top: 16px; }
  .panel h3 {
    font-family: "Barlow Condensed", "Inter", sans-serif; font-weight: 600; font-size: 18px;
    text-transform: uppercase; letter-spacing: 0.4px; margin: 0 0 12px;
  }
  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 22px; }
  .cols h4 { margin: 0 0 6px; font-size: 13px; color: var(--teal); letter-spacing: 1px; text-transform: uppercase; }
  .cols pre {
    font-family: Inter, sans-serif; font-size: 12.5px; color: #cbd5e1; white-space: pre-wrap; margin: 0;
    font-variant-numeric: tabular-nums;
  }
  ul { margin: 6px 0 0; padding-left: 18px; }
  li { margin: 5px 0; color: #cbd5e1; font-size: 14px; }
  li b { color: var(--text); }
  .status { display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase;
    padding: 3px 9px; border-radius: 999px; }
  .status.wip { background: rgba(245,158,11,0.14); color: var(--amber); border: 1px solid rgba(245,158,11,0.4); }
  .status.ok { background: rgba(45,212,191,0.14); color: var(--teal); border: 1px solid rgba(45,212,191,0.4); }
  .foot { margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--border); color: var(--muted); font-size: 13px; }
  @media (prefers-color-scheme: light) {
    :root:not([data-theme="dark"]) {
      --bg: #f4f6f8; --surface: #ffffff; --surface-2: #f0f3f6;
      --border: rgba(15,23,42,0.12); --text: #0e1116; --muted: #5b6675;
    }
  }
  :root[data-theme="light"] {
    --bg: #f4f6f8; --surface: #ffffff; --surface-2: #f0f3f6;
    --border: rgba(15,23,42,0.12); --text: #0e1116; --muted: #5b6675;
  }
</style>

<div class="wrap">
  <header>
    <p class="eyebrow">Brouillons — à valider avant publication</p>
    <h1>Pack contenu <span>Journée 1</span></h1>
    <p class="lede">
      Cinq visuels statiques (1080×1350) générés depuis les vraies données J1 de la prod.
      Rien n'est publié sur Instagram. Le reel récap arrive dans un second envoi.
    </p>
  </header>

  <h2>Les 5 posts <span class="status ok">rendus</span></h2>
  <div class="grid">${cards}</div>

  <h2>Le reel récap fantasy <span class="status wip">en cours</span></h2>
  <div class="panel">
    <p style="margin:0 0 14px;color:var(--muted);font-size:14px">
      Vertical 1080×1920, muet, ~45 s. 5 actes : intro → les 8 scores → le classement qui bouge
      (16 clubs à 0-0-0, ordre alphabétique, puis chaque ligne glisse vers son rang J1) →
      récap fantasy → plan final. Données ci-dessous, figées.
    </p>
    <div class="cols">
      <div>
        <h4>Équipe type J1</h4>
        <pre>${bestXI}</pre>
      </div>
      <div>
        <h4>Top 5 performances fantasy</h4>
        <pre>${data.fantasy.performances
          .map((p, i) => `${i + 1}. ${p.player ? p.player.firstName + " " + p.player.lastName : "?"} — ${p.points} pts (note ${p.lnhRating})`)
          .join("\n")}</pre>
      </div>
      <div>
        <h4>Top 5 classement général</h4>
        <pre>${topFantasy}</pre>
      </div>
      <div>
        <h4>Repères journée</h4>
        <pre>Moyenne : ${data.fantasy.avgGwPoints} pts
Médiane : ${data.fantasy.medianGwPoints} pts
Meilleur score : ${data.fantasy.maxGwPoints} pts
Équipes notées : ${data.fantasy.lineupCount}
Meilleur club : ${data.bestClub.shortName} (${data.bestClub.points} pts, ${data.bestClub.goalAvg > 0 ? "+" : ""}${data.bestClub.goalAvg})</pre>
      </div>
    </div>
  </div>

  <h2>Détail des stats (contrôle)</h2>
  <div class="panel">
    <div class="cols">
      <div><h4>Buteurs</h4><pre>${scorers}</pre></div>
      <div><h4>Passeurs</h4><pre>${passers}</pre></div>
      <div><h4>Gardiens (arrêts)</h4><pre>${keepers}</pre></div>
    </div>
  </div>

  <h2>Points à trancher</h2>
  <div class="panel">
    <ul>
      <li><b>Photos joueurs (posts 3-4-5)</b> — cutouts lnh.fr détourés, un peu petits dans le cadre. Je peux zoomer pour que le visage remplisse mieux le bandeau. OK tel quel, ou plus serré ?</li>
      <li><b>Logo USAM</b> (arc de cercle quasi transparent) — peu visible sur fond sombre dans les posts Résultats &amp; Classement. Version recolorée dispo (déjà faite pour le reel).</li>
      <li><b>Ex æquo</b> — Ilic / Kamtchop Baril (10 buts) et Porte / Lignières (12 passes) à égalité : le « hero » n'en montre qu'un, l'autre est en n°2 avec la même valeur. On garde, ou on met les deux à égalité en tête ?</li>
      <li><b>Reel — départ du classement</b> : je pars sur <b>alphabétique, 16 clubs à 0-0-0</b>. Confirme, ou tu préfères le classement final 2025/26 comme point de départ ?</li>
      <li><b>Titres des posts stats</b> — actuellement « TOTAL BUTS », « DERNIÈRE PASSE », « ARRÊTS » (noms LNH). Je peux passer à « TOP BUTEUR / PASSEUR / GARDIEN » si tu préfères.</li>
    </ul>
  </div>

  <p class="foot">
    Généré le ${new Date(data.generatedAt).toLocaleString("fr-FR")} · saison ${data.season} ·
    pipeline <code>scripts/social/matchday-j1/</code> · branche <code>matchday-pack-j1</code>
  </p>
</div>`;

process.stdout.write(html);
