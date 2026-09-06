// Rend <outDir>/reel/reel.html frame par frame (Playwright 1.48.2 macOS 13) puis
// assemble en <outDir>/reel-recap-j<gw>.mp4.
//   node scripts/social/gameweek-pack/render-reel.mjs <outDir> [full|encode|probe <ms>...]
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolvePlaywright } from "./config.mjs";

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

const gw = JSON.parse(readFileSync(join(OUT_DIR, "data.json"), "utf8")).gameweek.number;
const mp4 = join(OUT_DIR, `reel-recap-j${gw}.mp4`);

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
await page.waitForTimeout(500);
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
