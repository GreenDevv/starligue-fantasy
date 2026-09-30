// Actus du site officiel de la LFH (jeu LBE, ARCHITECTURE.md §35.5) — WordPress,
// API REST standard. Filtré sur la catégorie 20 « Ligue Butagaz Energie » (3 815
// articles au 29/09/2026) : pas de D2F, de Coupe de France ni de coupes d'Europe,
// même principe que le filtre Starligue du provider handnews.fr.
import { createWordpressNewsProvider } from "./wordpress.provider";

export const lfhNewsProvider = createWordpressNewsProvider({
  sourceKey: "lfh",
  siteUrl: "https://ligue-feminine-handball.fr",
  sourceType: "LNH_SITE",
  categories: [20],
});
