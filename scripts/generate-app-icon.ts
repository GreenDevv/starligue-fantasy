// Génère assets/logo.png : le mark "SF" transparent utilisé par
// `npx @capacitor/assets generate` (mode "Easy") pour produire toutes les
// icônes/splash iOS+Android. Même esprit visuel que src/app/icon.tsx (favicon
// web), mais en transparent car @capacitor/assets applique lui-même le fond
// (--iconBackgroundColor) sur les plateformes qui le permettent (ex. Android
// adaptive icons foreground/background séparés).
import sharp from "sharp";
import { mkdirSync } from "fs";
import { join } from "path";

const ACCENT = "#2DD4BF"; // teal — ARCHITECTURE.md §8.1

const SIZE = 1024;

const svg = `
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <text
    x="50%"
    y="53%"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="Arial Black, Helvetica, sans-serif"
    font-weight="800"
    font-size="440"
    fill="${ACCENT}"
  >SF</text>
</svg>
`;

async function main() {
  const outDir = join(process.cwd(), "assets");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "logo.png");
  await sharp(Buffer.from(svg)).resize(SIZE, SIZE).png().toFile(outPath);
  console.log(`Icône générée : ${outPath}`);
}

main();
