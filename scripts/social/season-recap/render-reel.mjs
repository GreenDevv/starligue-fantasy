// Rend <outDir>/reel/reel.html frame par frame (Playwright 1.48.2 macOS 13) puis
// assemble en <outDir>/reel-bilan-jA-jB.mp4. Copie de ../fantasy-recap/render-reel.mjs
// avec une attente supplémentaire au chargement (tuiles CARTO de la carte des clubs
// de cœur, chargées une fois au démarrage — pas de deuxième requête par frame).
//   node scripts/social/season-recap/render-reel.mjs <outDir> [stream|full|encode|probe <ms>...]
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolvePlaywright } from "../gameweek-pack/config.mjs";

const OUT_DIR = process.argv[2];
const mode = process.argv[3] || "full";
if (!OUT_DIR) {
  console.error("usage: render-reel.mjs <outDir> [full|encode|probe <ms>...]");
  process.exit(1);
}
const FPS = 30;
const REEL_DIR = join(OUT_DIR, "reel");
const framesDir = join(REEL_DIR, "frames");
const probeDir = join(REEL_DIR, "probe");
mkdirSync(framesDir, { recursive: true });
mkdirSync(probeDir, { recursive: true });

const data = JSON.parse(readFileSync(join(OUT_DIR, "data.json"), "utf8"));
const mp4 = join(OUT_DIR, `reel-bilan-j${data.firstGameweekNumber}-j${data.lastGameweekNumber}.mp4`);

if (mode === "encode") {
  execFileSync("ffmpeg", [
    "-y", "-framerate", String(FPS), "-i", join(framesDir, "f%04d.png"),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "19", "-preset", "slow",
    "-movflags", "+faststart", mp4,
  ], { stdio: "inherit" });
  console.log("→", mp4);
  process.exit(0);
}

const { chromium } = await import(pathToFileURL(resolvePlaywright()).href);
const browser = await chromium.launch({ args: ["--force-color-profile=srgb", "--disable-lcd-text"] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(REEL_DIR, "reel.html")).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
// Laisse le temps aux tuiles CARTO (carte des clubs de cœur) de charger — init unique
// au chargement de la page, pas par frame.
await page.waitForFunction(() => window.mapReady === true, { timeout: 8000 }).catch(() => {
  console.warn("⚠️  carte des clubs de cœur pas prête après 8s (clé CARTO manquante ?) — on continue.");
});
await page.waitForTimeout(800);
const TOTAL = await page.evaluate(() => window.TOTAL);
console.log("TOTAL", TOTAL, "ms →", Math.round((TOTAL / 1000) * FPS), "frames");

const shot = async (dir, name, t) => {
  await page.evaluate((tt) => window.seek(tt), t);
  await page.waitForTimeout(40);
  for (let a = 1; ; a++) {
    try {
      await page.screenshot({ path: join(dir, name), animations: "disabled", timeout: 30000, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
      return;
    } catch (e) { if (a >= 4) throw e; process.stdout.write("R"); await page.waitForTimeout(500); }
  }
};

if (mode === "stream") {
  // Mêmes captures PNG et mêmes réglages x264 que full+encode, mais envoyées
  // directement à ffmpeg (image2pipe) : aucune image intermédiaire sur disque
  // (~2 Go économisés pour ce reel long), qualité identique.
  const ff = spawn("ffmpeg", [
    "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "19", "-preset", "slow",
    "-movflags", "+faststart", mp4,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg exit " + c)))));
  const n = Math.round((TOTAL / 1000) * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate((tt) => window.seek(tt), Math.min((i / FPS) * 1000, TOTAL - 1));
    await page.waitForTimeout(40);
    let buf;
    for (let a = 1; ; a++) {
      try { buf = await page.screenshot({ type: "png", animations: "disabled", timeout: 30000, clip: { x: 0, y: 0, width: 1080, height: 1920 } }); break; }
      catch (e) { if (a >= 4) throw e; process.stdout.write("R"); await page.waitForTimeout(500); }
    }
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 30 === 0) process.stdout.write(`\n${i}/${n} `); else process.stdout.write(".");
  }
  ff.stdin.end();
  await done;
  await browser.close();
  console.log("\n→", mp4);
  process.exit(0);
}

if (mode === "probe") {
  for (const t of process.argv.slice(4).map(Number)) {
    await shot(probeDir, `t${String(t).padStart(6, "0")}.png`, t);
    process.stdout.write(".");
  }
} else {
  const n = Math.round((TOTAL / 1000) * FPS);
  for (let i = 0; i < n; i++) {
    const name = `f${String(i).padStart(4, "0")}.png`;
    if (existsSync(join(framesDir, name))) continue;
    await shot(framesDir, name, Math.min((i / FPS) * 1000, TOTAL - 1));
    if (i % 30 === 0) process.stdout.write(`\n${i}/${n} `); else process.stdout.write(".");
  }
}
await browser.close();
console.log("\nOK", mode);
