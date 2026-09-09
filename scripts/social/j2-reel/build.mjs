// Encode les frames rendues → <REEL_DIR>/reel-j2.mp4 (h264, 1080x1920, 30 fps, muet).
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";

const DIR = (process.env.REEL_DIR ?? "").replace(/\/?$/, "/");
if (!DIR || DIR === "/") { console.error("REEL_DIR manquant."); process.exit(1); }

const n = readdirSync(DIR + "frames").filter((f) => /^f\d+\.png$/.test(f)).length;
console.log(`${n} frames → reel-j2.mp4`);

execFileSync("ffmpeg", [
  "-y", "-framerate", "30", "-i", DIR + "frames/f%04d.png",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "19", "-preset", "slow",
  "-movflags", "+faststart", DIR + "reel-j2.mp4",
], { stdio: "inherit" });
console.log("OK →", DIR + "reel-j2.mp4");
