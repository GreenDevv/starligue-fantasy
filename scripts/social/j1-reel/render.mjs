import { chromium } from "/Users/tish/.npm/_npx/7f4967a1621aa3dc/node_modules/playwright/index.mjs";
import { mkdirSync, existsSync } from "node:fs";

const DIR = "/private/tmp/claude-501/-Users-tish-Projects-starligue-fantasy/47887ec3-5ee4-4513-ad7b-f4545bc385dc/scratchpad/reelj1/";
const FPS = 30;
const mode = process.argv[2] || "full";
const outDir = DIR + (mode === "probe" ? "probe/" : "frames/");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ["--force-color-profile=srgb", "--disable-lcd-text"] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto("file://" + DIR + "reel.html", { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
const TOTAL = await page.evaluate(() => window.TOTAL);
console.log("TOTAL", TOTAL);

const shot = async (name, t) => {
  await page.evaluate((tt) => window.seek(tt), t);
  await page.waitForTimeout(40);
  for (let a = 1; ; a++) {
    try { await page.screenshot({ path: outDir + name, animations: "disabled", timeout: 30000, clip: { x: 0, y: 0, width: 1080, height: 1920 } }); return; }
    catch (e) { if (a >= 4) throw e; process.stdout.write("R"); await page.waitForTimeout(500); }
  }
};

if (mode === "probe") {
  const ts = process.argv.slice(3).map(Number);
  for (const t of ts) { await shot(`t${String(t).padStart(6, "0")}.png`, t); process.stdout.write("."); }
} else {
  const n = Math.round((TOTAL / 1000) * FPS);
  for (let i = 0; i < n; i++) {
    const name = `f${String(i).padStart(4, "0")}.png`;
    if (existsSync(outDir + name)) continue;
    await shot(name, Math.min((i / FPS) * 1000, TOTAL - 1));
    if (i % 30 === 0) process.stdout.write(`\n${i}/${n} `); else process.stdout.write(".");
  }
}
await browser.close();
console.log("\nOK", mode);
