// Préfixe d'URL du jeu servi — ARCHITECTURE.md §35.7.
//
// Le jeu LBE vit sous starliguefantasy.fr/lbe (basePath Next.js, fixé au build par
// NEXT_PUBLIC_BASE_PATH="/lbe") ; le jeu Starligue à la racine (variable absente).
// Next applique le basePath tout seul aux <Link>, router.push, redirect et aux
// fichiers de public/, mais PAS aux fetch("/api/…"), au service worker, au
// manifest ni aux URL construites à la main : tout ça passe par withBasePath().
// Fonction PURE.

function normalize(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export const BASE_PATH = normalize(process.env.NEXT_PUBLIC_BASE_PATH);

/** "/api/x" → "/lbe/api/x" (jeu LBE) ; inchangé à la racine, et pour une URL absolue. */
export function withBasePath(path: string, basePath: string = BASE_PATH): string {
  if (!basePath || !path.startsWith("/") || path.startsWith("//")) return path;
  if (path === basePath || path.startsWith(`${basePath}/`)) return path;
  return `${basePath}${path}`;
}

/** Chemin du jeu LBE vu depuis le jeu servi à la racine (transféré par le rewrite de next.config.mjs). */
export function isLbeProxyPath(pathname: string): boolean {
  return pathname === "/lbe" || pathname.startsWith("/lbe/");
}

/** En-tête posé par le jeu Starligue sur les requêtes qu'il transfère au jeu LBE. */
export const PUBLIC_ORIGIN_HEADER = "x-lbe-public-origin";

/**
 * Origine publique d'une requête transférée par le jeu Starligue (en-têtes posés
 * par src/middleware.ts), ou null si la requête n'est pas passée par lui.
 * En priorité PUBLIC_ORIGIN_HEADER : en prod, le proxy d'entrée Railway du
 * service LBE ÉCRASE x-forwarded-host avec sa propre adresse (constaté le 30/09 :
 * Auth.js voyait web-lbe-production.up.railway.app) ; un en-tête propre à
 * l'appli traverse intact. x-forwarded-* en secours (essai local, sans proxy).
 * Seuls http/https sont acceptés comme protocole.
 */
export function forwardedOrigin(headers: Headers): string | null {
  const explicit = headers.get(PUBLIC_ORIGIN_HEADER)?.trim();
  if (explicit && /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(explicit)) return explicit.toLowerCase();
  const host = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return null;
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return `${proto === "http" ? "http" : "https"}://${host}`;
}

export const __test__ = { normalize };
