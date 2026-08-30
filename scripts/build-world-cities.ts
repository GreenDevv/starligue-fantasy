// Régénère src/lib/geo/data/world-cities.tsv.gz depuis GeoNames.
//
//   npx tsx scripts/build-world-cities.ts
//
// Source : https://download.geonames.org/export/dump/ (licence CC BY 4.0).
// `cities15000` = villes de plus de ~15 000 habitants (~34 k). Le fichier produit
// est trié par population décroissante (porte la pertinence de la recherche) et
// ne garde que : nom \t région(admin1, ASCII) \t pays(ISO2) \t lat \t lon \t pop.
//
// Dépend de `unzip` (présent sur macOS et les runners GitHub ubuntu).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";

const CITIES_URL = "https://download.geonames.org/export/dump/cities15000.zip";
const ADMIN1_URL = "https://download.geonames.org/export/dump/admin1CodesASCII.txt";
const OUT = "src/lib/geo/data/world-cities.tsv.gz";

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), "geonames-"));
  await Promise.all([
    download(CITIES_URL, path.join(dir, "cities15000.zip")),
    download(ADMIN1_URL, path.join(dir, "admin1.txt")),
  ]);
  execFileSync("unzip", ["-o", path.join(dir, "cities15000.zip"), "-d", dir], { stdio: "ignore" });

  const admin1 = new Map<string, string>();
  for (const line of readFileSync(path.join(dir, "admin1.txt"), "utf8").split("\n")) {
    const [code, , asciiName] = line.split("\t");
    if (code && asciiName) admin1.set(code, asciiName);
  }

  const rows: [string, string, string, number, number, number][] = [];
  for (const line of readFileSync(path.join(dir, "cities15000.txt"), "utf8").split("\n")) {
    if (!line) continue;
    const f = line.split("\t");
    const name = f[1];
    const lat = Number(f[4]);
    const lon = Number(f[5]);
    const cc = f[8];
    if (!name || !cc || Number.isNaN(lat) || Number.isNaN(lon)) continue;
    const a1 = admin1.get(`${cc}.${f[10]}`) ?? "";
    const pop = Number(f[14]) || 0;
    rows.push([name, a1, cc, Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4, pop]);
  }
  rows.sort((a, b) => b[5] - a[5]);

  const tsv = rows.map((r) => r.join("\t")).join("\n");
  writeFileSync(OUT, gzipSync(Buffer.from(tsv, "utf8"), { level: 9 }));
  console.log(`${OUT} — ${rows.length} villes, ${(tsv.length / 1e6).toFixed(1)} Mo brut`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
