// Télécharge les photos détourées lnh.fr des 16 joueurs mis en avant → <REEL_DIR>/players/<SHORTNAME>.png
// lnh.fr renvoie 403 sans UA navigateur + Referer.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const DIR = (process.env.REEL_DIR ?? "").replace(/\/?$/, "/");
if (!DIR || DIR === "/") { console.error("REEL_DIR manquant."); process.exit(1); }

const d = JSON.parse(readFileSync(DIR + "data.json", "utf-8"));
mkdirSync(DIR + "players", { recursive: true });

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

for (const [sn, p] of Object.entries(d.picks)) {
  if (!p.photoUrl) { console.warn("PAS de photo pour", sn, "-", p.name); continue; }
  const res = await fetch(p.photoUrl, { headers: { "User-Agent": UA, Referer: "https://www.lnh.fr/" } });
  if (!res.ok) { console.error("ÉCHEC", sn, res.status, p.photoUrl); process.exit(1); }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(DIR + "players/" + sn + ".png", buf);
  console.log(`${sn.padEnd(9)} ${p.name.padEnd(28)} ${(buf.length / 1024).toFixed(0)} Ko`);
}
console.log("OK photos.");
