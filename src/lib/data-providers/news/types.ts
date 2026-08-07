// Interface commune à toutes les sources d'actus scrapées (lnh.fr + sites de clubs)
// — voir src/lib/data-providers/news/registry.ts pour l'agrégation et
// src/app/api/cron/sync-news/route.ts pour l'orchestration (classify + dedupe + upsert).

export interface ScrapedNewsItem {
  title: string;
  excerpt: string | null;
  /** Texte intégral (paragraphes, pas de HTML — src/lib/news/html-to-text.ts), si déjà
   *  disponible dans la réponse de listing (ex: WordPress REST renvoie content.rendered
   *  gratuitement). Sinon null : le cron appellera fetchArticleContent() séparément,
   *  mais UNIQUEMENT pour les items réellement nouveaux (jamais pour un doublon déjà
   *  connu), pour ne pas multiplier les requêtes par 12/17 à chaque run. */
  content: string | null;
  sourceUrl: string;
  imageUrl: string | null;
  publishedAt: Date;
  /** Slug lnh.fr du club concerné (externalIds.lnh), pour résoudre NewsItem.clubId. */
  clubExternalSlug?: string;
}

export interface NewsSourceProvider {
  /** "lnh" | slug du club (ex: "montpellier") | "handnews" — clé stable stockée dans NewsItem.sourceKey. */
  sourceKey: string;
  sourceType: "LNH_SITE" | "CLUB_SITE" | "MEDIA_SITE";
  /** Lève IngestionError (recoverable) en cas d'échec — jamais fatal pour les autres sources. */
  fetchNews(): Promise<ScrapedNewsItem[]>;
  /** Optionnel : récupère le texte intégral d'un article dont fetchNews() n'a renvoyé
   *  que le résumé (ex: lnh.fr, page article séparée). Retourne null si échec/absent —
   *  jamais fatal, l'item reste publié avec son excerpt seul. */
  fetchArticleContent?(sourceUrl: string): Promise<string | null>;
}
