#!/usr/bin/env node
// Orchestrateur du reel « bilan après N journées » (voir README.md).
//   pnpm tsx scripts/social/season-recap/generate.mjs <lastGameweekNumber> [--out <dir>] [--no-render] [--probe <ms>...] [--publish]
//   pnpm tsx scripts/social/season-recap/generate.mjs --auto
// --auto : N = dernière journée notée ET confirmée (corrections LNH du mardi passées) ;
// ne fait rien si public/social/reel-bilan-j1-jN.mp4 existe déjà ; sinon génère et copie
// le mp4 dans public/social/ (= --publish). Écrit gameweek=/generated= dans
// $GITHUB_OUTPUT quand il tourne en CI (.github/workflows/reel-bilan.yml).
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { existsSync, statSync, readFileSync, copyFileSync, appendFileSync, readdirSync } from "node:fs";
import { REPO, resolveProdDatabaseUrl } from "../gameweek-pack/config.mjs";

const HERE = new URL(".", import.meta.url).pathname;
const args = process.argv.slice(2);
const AUTO = args.includes("--auto");
const tsxBin = join(REPO, "node_modules/.bin/tsx");
const ghOutput = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };
let GW = Number(args[0]);
if (AUTO) {
  const out = execFileSync(tsxBin, [join(HERE, "latest-confirmed.ts")], {
    cwd: REPO, encoding: "utf8", env: { ...process.env, DATABASE_URL: resolveProdDatabaseUrl() },
  }).trim();
  GW = Number(out);
  if (!GW) { console.log("Aucune journée confirmée — rien à faire."); ghOutput("generated", "false"); process.exit(0); }
  // Déjà fait si un bilan de cette journée OU d'une plus récente est publié (évite de
  // régénérer un vieux bilan quand la confirmation arrive après un bilan manuel).
  const published = readdirSync(join(REPO, "public/social"))
    .map((f) => f.match(/^reel-bilan-j\d+-j(\d+)\.mp4$/)?.[1])
    .filter(Boolean).map(Number);
  if (published.some((n) => n >= GW)) {
    console.log(`Bilan J${Math.max(...published)} déjà publié (≥ J${GW}) — rien à faire.`); ghOutput("generated", "false"); process.exit(0);
  }
  console.log(`→ bilan J1–J${GW} à générer`);
}
if (!GW) {
  console.error("usage: generate.mjs <lastGameweekNumber> [--out <dir>] [--no-render] [--probe <ms>...]");
  process.exit(1);
}
const flag = (name) => args.includes(name);
const outArg = args[args.indexOf("--out") + 1];
const OUT_DIR = flag("--out") && outArg ? outArg : join(REPO, "scratch", "season-recap", `j${GW}`);
const probeIdx = args.indexOf("--probe");
const probeTimes = probeIdx >= 0 ? args.slice(probeIdx + 1).filter((a) => /^\d+$/.test(a)) : [];

const tsx = tsxBin;
const run = (cmd, cmdArgs, env) => {
  console.log(`\n$ ${cmd} ${cmdArgs.join(" ")}`);
  execFileSync(cmd, cmdArgs, { stdio: "inherit", cwd: REPO, env: { ...process.env, ...env } });
};
const t0 = Date.now();

// 1. Données (prod) : base fantasy cumulée (fantasy-recap) + faits du bilan
const DB = resolveProdDatabaseUrl();
run(tsx, [join(HERE, "pull-base.ts"), String(GW), OUT_DIR], { DATABASE_URL: DB });
run(tsx, [join(HERE, "pull-extra.ts"), String(GW), OUT_DIR], { DATABASE_URL: DB });

// 2. Le reel
run("node", [join(HERE, "gen-reel.mjs"), OUT_DIR]);
if (probeTimes.length) {
  run("node", [join(HERE, "render-reel.mjs"), OUT_DIR, "probe", ...probeTimes]);
} else if (!flag("--no-render")) {
  // rendu en flux direct vers ffmpeg : pas d'images intermédiaires sur disque
  run("node", [join(HERE, "render-reel.mjs"), OUT_DIR, "stream"]);
}

const data = JSON.parse(readFileSync(join(OUT_DIR, "data.json"), "utf8"));
const mp4 = join(OUT_DIR, `reel-bilan-j${data.firstGameweekNumber}-j${data.lastGameweekNumber}.mp4`);
console.log(`\n─────────────────────────────────────────`);
console.log(`Bilan J${data.firstGameweekNumber}→J${data.lastGameweekNumber} → ${OUT_DIR}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
if (existsSync(mp4)) console.log(`  ${mp4.split("/").pop()}   ${(statSync(mp4).size / 1e6).toFixed(1)} Mo`);
if ((AUTO || flag("--publish")) && existsSync(mp4)) {
  const dest = join(REPO, "public/social", mp4.split("/").pop());
  copyFileSync(mp4, dest);
  console.log(`→ copié dans ${dest} (reste à commit + push sur main pour le servir)`);
  ghOutput("generated", "true");
  ghOutput("gameweek", String(data.lastGameweekNumber));
  ghOutput("file", mp4.split("/").pop());
} else {
  console.log(`\nRien n'est publié. Relire le mp4, puis copier dans public/social/ + push sur main pour le servir.`);
}
