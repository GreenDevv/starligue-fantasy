// Classification heuristique du contenu scrapé (lnh.fr + sites de clubs) en
// NewsCategory. Best-effort : aucune source structurée n'existe pour les transferts
// réels (ARCHITECTURE.md), un titre contenant du vocabulaire de transfert suffit à
// taguer TRANSFER. INJURY/TEAM_OF_WEEK/PERFORMANCE ne sont JAMAIS posées ici — ce
// sont des catégories exclusivement produites par les générateurs internes
// (src/lib/news/generate-injury-news.ts, generate-weekly-news.ts), pour ne pas
// mélanger donnée admin-confirmée/calculée et rumeur de presse scrapée.
import type { NewsCategory } from "@prisma/client";
import { normalizeTitle } from "./dedupe";

const TRANSFER_KEYWORDS = [
  "transfert",
  "transfere",
  "signe",
  "signature",
  "s'engage",
  "sengage",
  "rejoint",
  "quitte",
  "quitter",
  "prolonge",
  "prolongation",
  "recrue",
  "arrivee",
  "arrive au",
  "arrive a",
  "depart",
  "resiliation",
  "libre",
];

export function classifyNewsCategory(title: string, excerpt: string | null): NewsCategory {
  const normalized = normalizeTitle(`${title} ${excerpt ?? ""}`);
  const tokens = new Set(normalized.split(" "));

  const isTransfer = TRANSFER_KEYWORDS.some((keyword) => {
    if (keyword.includes(" ")) return normalized.includes(keyword);
    return tokens.has(keyword);
  });

  return isTransfer ? "TRANSFER" : "GENERAL";
}
