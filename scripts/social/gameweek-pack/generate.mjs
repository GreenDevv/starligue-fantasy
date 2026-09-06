#!/usr/bin/env node
// Pack de contenu Instagram d'une journée : les 5 visuels + le reel récap.
// À lancer une fois la journée clôturée (dernier match noté, cf.
// [[gameweek_close_and_matchday_pack]] : sync-ratings → snapshot-lineups →
// compute-scores → sync-standings sur la prod).
//
//   pnpm tsx scripts/social/gameweek-pack/generate.mjs <gameweekNumber> [options]
//
// Options :
//   --out <dir>      dossier de sortie (défaut : scratch/gameweek-pack/j<N>/)
//   --posts-only     seulement les 5 visuels
//   --reel-only      seulement le reel
//   --no-render      génère reel.html mais ne rend pas la vidéo (rapide)
//   --probe <ms>...  rend seulement ces instants du reel (aperçu)
//
// La base prod est résolue automatiquement (PROD_DATABASE_URL / DATABASE_URL /
// `railway variables`). Rien n'est publié : sortie = fichiers à relire.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { existsSync, statSync } from "node:fs";
import { HERE, REPO, outDirFor, resolveProdDatabaseUrl } from "./config.mjs";

const args = process.argv.slice(2);
const gw = Number(args[0]);
if (!gw || gw < 1) {
  console.error("usage: generate.mjs <gameweekNumber> [--out <dir>] [--posts-only|--reel-only] [--no-render] [--probe <ms>...]");
  process.exit(1);
}
const flag = (name) => args.includes(name);
const outArg = args[args.indexOf("--out") + 1];
const OUT_DIR = flag("--out") && outArg ? outArg : outDirFor(gw);
const probeIdx = args.indexOf("--probe");
const probeTimes = probeIdx >= 0 ? args.slice(probeIdx + 1).filter((a) => /^\d+$/.test(a)) : [];
const doPosts = !flag("--reel-only");
const doReel = !flag("--posts-only");

const tsx = join(REPO, "node_modules/.bin/tsx");
const run = (cmd, cmdArgs, env) => {
  console.log(`\n$ ${cmd} ${cmdArgs.join(" ")}`);
  execFileSync(cmd, cmdArgs, { stdio: "inherit", cwd: REPO, env: { ...process.env, ...env } });
};
const t0 = Date.now();

// 1. Données
const DB = resolveProdDatabaseUrl();
run(tsx, [join(HERE, "pull.ts"), String(gw), OUT_DIR], { DATABASE_URL: DB });

// 2. Les 5 visuels (routes OG déployées en prod)
if (doPosts) run("node", [join(HERE, "gen-posts.mjs"), OUT_DIR]);

// 3. Le reel
if (doReel) {
  run("node", [join(HERE, "gen-reel.mjs"), OUT_DIR]);
  if (probeTimes.length) {
    run("node", [join(HERE, "render-reel.mjs"), OUT_DIR, "probe", ...probeTimes]);
  } else if (!flag("--no-render")) {
    run("node", [join(HERE, "render-reel.mjs"), OUT_DIR, "full"]);
    run("node", [join(HERE, "render-reel.mjs"), OUT_DIR, "encode"]);
  }
}

// 4. Page de revue
run("node", [join(HERE, "gen-preview.mjs"), OUT_DIR]);

const mp4 = join(OUT_DIR, `reel-recap-j${gw}.mp4`);
console.log(`\n─────────────────────────────────────────`);
console.log(`Pack J${gw} → ${OUT_DIR}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
if (doPosts) console.log(`  posts/            5 visuels 1080×1350`);
if (doReel && existsSync(mp4)) console.log(`  reel-recap-j${gw}.mp4   ${(statSync(mp4).size / 1e6).toFixed(1)} Mo`);
console.log(`  preview.html      page de revue (→ publier en Artifact)`);
console.log(`\nRien n'est publié. Prochaine étape : relire preview.html, puis`);
console.log(`copier le mp4 dans public/social/ + pousser sur main pour le servir.`);
