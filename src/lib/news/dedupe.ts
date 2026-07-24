// Dédoublonnage du flux d'actus Starligue (page publique /starligue). Deux niveaux :
// 1) idempotence exacte par source, portée par la colonne unique NewsItem.dedupeKey
//    (upsert, jamais de create nu — voir src/app/api/cron/sync-news/route.ts).
// 2) quasi-doublon CROSS-source (la même actu réelle publiée à la fois sur lnh.fr et
//    sur le site d'un club, avec des titres/URLs différents) — pas encodable en
//    contrainte SQL, géré ici en logique applicative pure et testée.
import type { NewsCategory } from "@prisma/client";

export function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents (marques diacritiques combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Mots vides français les plus courants dans un titre d'actu — les filtrer isole
// les noms propres/mots-clés qui portent le sens (le fait que deux titres partagent
// "le"/"de"/"son" ne dit rien sur le fait qu'ils parlent de la même histoire), pour
// une similarité plus fiable entre deux réécritures indépendantes du même événement.
const STOPWORDS = new Set([
  "le", "la", "les", "l", "un", "une", "des", "de", "du", "d",
  "et", "ou", "a", "au", "aux", "en", "sur", "dans", "par", "pour", "avec",
  "son", "sa", "ses", "ce", "cet", "cette", "ces", "s", "est", "sont",
]);

function tokenize(title: string): Set<string> {
  return new Set(
    normalizeTitle(title)
      .split(" ")
      .filter((t) => t.length > 0 && !STOPWORDS.has(t))
  );
}

/** Similarité de Jaccard sur les tokens du titre normalisé, 0..1. */
export function titleSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface DedupeCandidate {
  title: string;
  publishedAt: Date;
  category: NewsCategory;
  clubId: string | null;
}

const DEFAULT_SIMILARITY_THRESHOLD = 0.3;
const DEFAULT_MAX_DAY_GAP = 2;

/**
 * true si `candidate` est un quasi-doublon d'un item de `recentItems` (déjà
 * pré-filtré par l'appelant sur une fenêtre récente, ex. 7 jours). Ne fusionne rien,
 * signale juste "ne pas insérer" — le premier arrivé (généralement lnh.fr, scrapé en
 * premier dans le registry) est conservé tel quel.
 */
export function findNearDuplicate(
  candidate: DedupeCandidate,
  recentItems: DedupeCandidate[],
  opts?: { similarityThreshold?: number; maxDayGap?: number }
): boolean {
  const similarityThreshold = opts?.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const maxDayGap = opts?.maxDayGap ?? DEFAULT_MAX_DAY_GAP;
  const maxGapMs = maxDayGap * 24 * 60 * 60 * 1000;

  return recentItems.some((existing) => {
    if (existing.category !== candidate.category) return false;
    if (existing.clubId && candidate.clubId && existing.clubId !== candidate.clubId) return false;

    const gapMs = Math.abs(candidate.publishedAt.getTime() - existing.publishedAt.getTime());
    if (gapMs > maxGapMs) return false;

    return titleSimilarity(candidate.title, existing.title) >= similarityThreshold;
  });
}
