// Étape « visuels » du pack : récupère les 5 posts statiques (1080×1350) depuis les
// routes OG déployées en prod → <outDir>/posts/*.png.
//   node scripts/social/gameweek-pack/gen-posts.mjs <outDir>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { SITE } from "./config.mjs";

const OUT_DIR = process.argv[2];
if (!OUT_DIR) {
  console.error("usage: gen-posts.mjs <outDir>");
  process.exit(1);
}
const data = JSON.parse(readFileSync(join(OUT_DIR, "data.json"), "utf8"));
const gw = data.gameweek.number;
const seasonId = data.seasonId;
if (!seasonId) {
  console.error("data.json sans seasonId — relance pull.ts (version à jour).");
  process.exit(1);
}
const postsDir = join(OUT_DIR, "posts");
mkdirSync(postsDir, { recursive: true });

const q = (params) => new URLSearchParams({ seasonId, gameweekNumber: String(gw), ...params }).toString();
const POSTS = [
  { name: "1-resultats", path: `/api/og/gameweek-results?${q({})}` },
  { name: "2-classement", path: `/api/og/gameweek-standings?${q({})}` },
  { name: "3-top-buteurs", path: `/api/og/stat-leaders?${q({ statKey: "goalsTotal", scope: "gameweek" })}` },
  { name: "4-top-passeurs", path: `/api/og/stat-leaders?${q({ statKey: "assists", scope: "gameweek" })}` },
  { name: "5-top-gardiens", path: `/api/og/stat-leaders?${q({ statKey: "saves", scope: "gameweek" })}` },
];

let ok = 0;
for (const p of POSTS) {
  const url = SITE + p.path;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`✗ ${p.name} — HTTP ${res.status} (${url})`);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const dest = join(postsDir, `${p.name}.png`);
  writeFileSync(dest, buf);
  console.log(`✓ ${p.name}.png  (${(buf.length / 1024).toFixed(0)} Ko)`);
  ok++;
}
if (ok < POSTS.length) {
  console.error(`${ok}/${POSTS.length} posts générés.`);
  process.exit(1);
}
console.log(`→ ${postsDir}`);
