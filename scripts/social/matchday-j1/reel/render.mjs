// Rend reel.html frame par frame (Playwright 1.48.2 macOS 13) puis assemble en mp4.
//   node scripts/social/matchday-j1/reel/render.mjs probe 0 4000 12000 22000 34000 42000
//   node scripts/social/matchday-j1/reel/render.mjs full
//   node scripts/social/matchday-j1/reel/render.mjs encode
import { chromium } from "/Users/tish/.npm/_npx/7f4967a1621aa3dc/node_modules/playwright/index.mjs";
import { mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const DIR = "/private/tmp/claude-501/-Users-tish-Projects-starligue-fantasy/864acd49-1050-43cb-9adb-5972703f0ea6/scratchpad/recap-reel/";
const FPS = 30;
const mode = process.argv[2] || "full";
const framesDir = DIR + "frames/";
const probeDir = DIR + "probe/";
mkdirSync(framesDir, { recursive: true });
mkdirSync(probeDir, { recursive: true });

if (mode === "encode") {
  execFileSync("ffmpeg", [
    "-y", "-framerate", String(FPS), "-i", framesDir + "f%04d.png",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "19", "-preset", "slow",
    "-movflags", "+faststart", DIR + "reel-recap-j1.mp4",
  ], { stdio: "inherit" });
  console.log("→", DIR + "reel-recap-j1.mp4");
  process.exit(0);
}

const browser = await chromium.launch({ args: ["--force-color-profile=srgb", "--disable-lcd-text"] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto("file://" + DIR + "reel.html", { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
const TOTAL = await page.evaluate(() => window.TOTAL);
console.log("TOTAL", TOTAL, "ms →", Math.round((TOTAL / 1000) * FPS), "frames");

const shot = async (dir, name, t) => {
  await page.evaluate((tt) => window.seek(tt), t);
  await page.waitForTimeout(40);
  for (let a = 1; ; a++) {
    try {
      await page.screenshot({ path: dir + name, animations: "disabled", timeout: 30000, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
      return;
    } catch (e) { if (a >= 4) throw e; process.stdout.write("R"); await page.waitForTimeout(500); }
  }
};

if (mode === "probe") {
  const ts = process.argv.slice(3).map(Number);
  for (const t of ts) { await shot(probeDir, `t${String(t).padStart(6, "0")}.png`, t); process.stdout.write("."); }
} else {
  const n = Math.round((TOTAL / 1000) * FPS);
  for (let i = 0; i < n; i++) {
    const name = `f${String(i).padStart(4, "0")}.png`;
    if (existsSync(framesDir + name)) continue;
    await shot(framesDir, name, Math.min((i / FPS) * 1000, TOTAL - 1));
    if (i % 30 === 0) process.stdout.write(`\n${i}/${n} `); else process.stdout.write(".");
  }
}
await browser.close();
console.log("\nOK", mode);
