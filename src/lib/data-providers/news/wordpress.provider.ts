// Factory générique pour les clubs dont le site officiel tourne sous WordPress avec
// l'API REST publique (wp-json/wp/v2/posts) — beaucoup plus fiable qu'un scraping
// HTML par regex : JSON structuré, dates ISO exactes (pas de "il y a N jours" à
// interpréter comme pour lnh.fr). Découvert en reconnaissance le 2026-07-23 :
// istreshandball.com, teamchambe.com, srvhb.com, sa-hb.com exposent tous cette API
// sans authentification. Un club qui ne l'expose pas (404/plugin désactivé, ex.
// pro.ccmhb.fr constaté ce jour-là) a besoin d'un provider dédié (scraping HTML) —
// voir clubs/README dans ce dossier pour la liste à jour.
import { IngestionError } from "../lnh-scraper.provider";
import { htmlToPlainContent } from "@/lib/news/html-to-text";
import type { NewsSourceProvider, ScrapedNewsItem } from "./types";

interface WpMedia {
  source_url?: string;
}

interface WpPost {
  date: string; // heure locale du site, pas UTC — suffisant pour notre résolution au jour près
  link: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  content: { rendered: string };
  _embedded?: { "wp:featuredmedia"?: WpMedia[] };
}

const NAMED_ENTITIES: Record<string, string> = {
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  amp: "&",
  nbsp: " ",
  quot: '"',
  apos: "'",
  hellip: "…",
};

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&([a-z]+);/gi, (full: string, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? full)
    .replace(/\s+/g, " ")
    .trim();
}

// Constaté sur plusieurs clubs (ex: usam-nimesgard.fr) : le thème WordPress répète
// le titre en tête de l'extrait ("Titre ! Titre ! Crédit photo : ..."), avant le
// vrai résumé — cosmétique mais moche à l'affichage (NewsCard montre déjà le titre
// juste au-dessus). Retire ce préfixe dupliqué s'il est présent, sans y toucher sinon.
function stripLeadingTitleDuplicate(text: string, title: string): string {
  const trimmedTitle = title.trim();
  if (trimmedTitle.length > 0 && text.startsWith(trimmedTitle)) {
    return text.slice(trimmedTitle.length).trim();
  }
  return text;
}

export function createWordpressNewsProvider(opts: {
  sourceKey: string;
  siteUrl: string; // ex: "https://istreshandball.com"
  clubExternalSlug: string;
  perPage?: number;
}): NewsSourceProvider {
  const perPage = opts.perPage ?? 12;

  return {
    sourceKey: opts.sourceKey,
    sourceType: "CLUB_SITE",

    async fetchNews(): Promise<ScrapedNewsItem[]> {
      const url = `${opts.siteUrl}/wp-json/wp/v2/posts?per_page=${perPage}&_embed`;
      let res: Response;
      try {
        res = await globalThis.fetch(url, {
          signal: AbortSignal.timeout(15000),
          headers: { "User-Agent": "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)" },
        });
      } catch (e) {
        throw new IngestionError(`${opts.sourceKey} : requête réseau échouée (${String(e)})`, opts.sourceKey, true);
      }
      if (!res.ok) {
        throw new IngestionError(`${opts.sourceKey} : HTTP ${res.status} sur ${url}`, opts.sourceKey, true);
      }

      const posts = (await res.json()) as WpPost[];
      if (!Array.isArray(posts)) {
        throw new IngestionError(`${opts.sourceKey} : réponse REST inattendue (pas une liste)`, opts.sourceKey, true);
      }

      return posts.map((post) => {
        const title = stripHtml(post.title.rendered);
        const excerpt = post.excerpt?.rendered ? stripLeadingTitleDuplicate(stripHtml(post.excerpt.rendered), title) : null;
        const content = post.content?.rendered ? htmlToPlainContent(post.content.rendered) : null;

        return {
          title,
          excerpt: excerpt && excerpt.length > 0 ? excerpt : null,
          content: content ? stripLeadingTitleDuplicate(content, title) : null,
          sourceUrl: post.link,
          imageUrl: post._embedded?.["wp:featuredmedia"]?.[0]?.source_url ?? null,
          publishedAt: new Date(post.date),
          clubExternalSlug: opts.clubExternalSlug,
        };
      });
    },
  };
}
