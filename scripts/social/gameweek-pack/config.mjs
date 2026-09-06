// Constantes et helpers partagés du pack de contenu par journée.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, "../../..");

// Site prod : sert les routes OG (visuels) et servira le reel une fois poussé.
export const SITE = process.env.SITE_URL || "https://starliguefantasy.fr";

// Dossier de travail d'une journée : scratch/gameweek-pack/j<N>/ (git-ignoré via /scratch).
export function outDirFor(gw) {
  return process.env.GWPACK_OUT || join(REPO, "scratch", "gameweek-pack", `j${gw}`);
}

// URL de la base prod : $DATABASE_URL / $PROD_DATABASE_URL, sinon `railway variables`.
export function resolveProdDatabaseUrl() {
  const fromEnv = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL;
  if (fromEnv && !/localhost|127\.0\.0\.1/.test(fromEnv)) return fromEnv;
  try {
    const out = execFileSync("railway", ["variables", "--service", "Postgres", "--kv"], {
      encoding: "utf8",
      cwd: REPO,
    });
    const line = out.split("\n").find((l) => l.startsWith("DATABASE_PUBLIC_URL="));
    if (line) {
      const url = line.slice("DATABASE_PUBLIC_URL=".length).trim();
      return url.includes("?") ? `${url}&sslmode=require` : `${url}?sslmode=require`;
    }
  } catch {
    /* railway CLI absente / non liée */
  }
  throw new Error(
    "Impossible de résoudre l'URL de la base prod. Renseigne PROD_DATABASE_URL, ou lie le CLI railway (`railway link`).",
  );
}

// Chromium via le paquet Playwright déjà installé (pinné 1.48.2 pour macOS 13).
// Cherche dans le node_modules du repo puis dans les caches npx connus.
export function resolvePlaywright() {
  const candidates = [
    join(REPO, "node_modules/playwright/index.mjs"),
    ...(process.env.PLAYWRIGHT_DIR ? [join(process.env.PLAYWRIGHT_DIR, "index.mjs")] : []),
  ];
  try {
    const req = createRequire(join(REPO, "package.json"));
    candidates.push(req.resolve("playwright"));
  } catch {
    /* pas installé dans le repo */
  }
  // caches npx (`npx playwright-core@1.48.2 …`)
  try {
    const npxRoot = join(process.env.HOME || "", ".npm/_npx");
    if (existsSync(npxRoot)) {
      for (const d of execFileSync("ls", [npxRoot], { encoding: "utf8" }).split("\n")) {
        if (d) candidates.push(join(npxRoot, d, "node_modules/playwright/index.mjs"));
      }
    }
  } catch {
    /* ignore */
  }
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) {
    throw new Error(
      "Playwright introuvable. Installe-le (`pnpm add -D playwright@1.48.2` sur macOS 13) ou passe PLAYWRIGHT_DIR.",
    );
  }
  return found;
}

export const b64 = (buf) => buf.toString("base64");
