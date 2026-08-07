// Actus handnews.fr — média indépendant handball (pas lnh.fr, pas un site de club),
// d'où le sourceType dédié MEDIA_SITE (ajouté à l'enum Prisma NewsSourceType).
// Reconnaissance faite le 2026-08-07 : WordPress (thème "handnews"), mais API REST
// désactivée (wp-json renvoie {"code":"rest_disabled"}) — scraping HTML par regex,
// comme lnh.fr et la plupart des clubs.
//
// Le site couvre tout le handball (Starligue, Proligue, équipes de France, Europe...).
// Le seul filtrage disponible côté source est la page /tag/starligue/ : chaque carte y
// affiche une étiquette de catégorie ("STL " = actu Starligue, "LMS " = mercato
// Starligue — constaté sur des clubs Starligue uniquement : Nîmes, Caen, Montpellier,
// Sélestat, Cesson-Rennes..., "LNH " = décisions fédérales généralistes qui débordent
// sur la Proligue, "Transferts " = simple bandeau "l'espace Transferts est à jour",
// pas un article). On ne garde que STL + LMS — LNH/Transferts exclus explicitement
// pour rester strictement Starligue (demande explicite du user, cf. mémoire projet :
// ne pas déduire un périmètre plus large que demandé).
//
// Une seule page suffit pour un run quotidien : ~32 items/page et src/lib/news/sync.ts
// ignore de toute façon tout ce qui n'est pas publié aujourd'hui (todayStart).
//
// Pas de slug club exploitable dans le listing (pas de logo/lien catégorie) —
// détection par mots-clés sur le titre (best effort, clubId reste null si aucun
// match : sans conséquence, cf. types.ts).
import { IngestionError } from "../lnh-scraper.provider";
import { htmlToPlainContent } from "@/lib/news/html-to-text";
import type { NewsSourceProvider, ScrapedNewsItem } from "./types";

const SITE = "https://handnews.fr";
const LISTING_URL = `${SITE}/tag/starligue/`;
const USER_AGENT = "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)";

// Étiquettes ds-u-category-small acceptées comme strictement Starligue (voir en-tête).
const ALLOWED_CATEGORIES = new Set(["stl", "lms"]);

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

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&([a-z]+);/gi, (full: string, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? full);
}

// Slug lnh (externalIds.lnh, cf. prisma/seed.ts CLUB_META) déduit par mots-clés dans
// le titre — accents normalisés pour tolérer "Sélestat"/"Selestat" etc.
const CLUB_KEYWORDS: Array<{ slug: string; keywords: string[] }> = [
  { slug: "paris", keywords: ["psg", "paris"] },
  { slug: "montpellier", keywords: ["montpellier", "mhb"] },
  { slug: "nantes", keywords: ["nantes", "hbc nantes"] },
  { slug: "aix", keywords: ["pauc", "aix-en-provence", "aix "] },
  { slug: "chambery", keywords: ["chambery"] },
  { slug: "nimes", keywords: ["nimes", "usam"] },
  { slug: "dunkerque", keywords: ["dunkerque", "usdk"] },
  { slug: "toulouse", keywords: ["toulouse", "fenix"] },
  { slug: "saran", keywords: ["saran"] },
  { slug: "limoges", keywords: ["limoges"] },
  { slug: "cesson-rennes", keywords: ["cesson"] },
  { slug: "selestat", keywords: ["selestat"] },
  { slug: "chartres", keywords: ["chartres"] },
  { slug: "caen", keywords: ["caen"] },
  { slug: "saint-raphael", keywords: ["saint-raphael", "st-raphael"] },
  { slug: "tremblay", keywords: ["tremblay"] },
];

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function detectClubSlug(title: string): string | undefined {
  const normalized = stripAccents(title).toLowerCase();
  for (const { slug, keywords } of CLUB_KEYWORDS) {
    if (keywords.some((kw) => normalized.includes(kw))) return slug;
  }
  return undefined;
}

interface RawCard {
  block: string;
}

function extractCards(html: string): RawCard[] {
  const cards: RawCard[] = [];
  const re = /<article class="ds-c-newsCard"[\s\S]*?<\/article>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    cards.push({ block: m[0] });
  }
  return cards;
}

function parseListing(html: string): ScrapedNewsItem[] {
  const items: ScrapedNewsItem[] = [];

  for (const card of extractCards(html)) {
    const categoryMatch = card.block.match(/ds-u-category-small">\s*([^<]*)</);
    const category = categoryMatch?.[1]?.trim().toLowerCase();
    if (!category || !ALLOWED_CATEGORIES.has(category)) continue;

    const dateMatch = card.block.match(/<time pubdate datetime="([^"]*)"/);
    const linkMatch = card.block.match(/<a href="([^"]+)">\s*<h2 class="ds-c-newsCard-title">/);
    const titleMatch = card.block.match(/<h2 class="ds-c-newsCard-title">\s*([^<]*)</);
    const imageMatch = card.block.match(/<source srcset="([^",]+)/);

    const sourceUrl = linkMatch?.[1];
    const title = titleMatch?.[1] ? decodeHtmlEntities(titleMatch[1].trim()) : null;
    if (!sourceUrl || !title || !dateMatch?.[1]) continue;

    items.push({
      title,
      excerpt: null,
      content: null, // page de listing seule — fetchArticleContent() récupère le texte intégral
      sourceUrl,
      imageUrl: imageMatch?.[1] ?? null,
      publishedAt: new Date(dateMatch[1]),
      clubExternalSlug: detectClubSlug(title),
    });
  }

  return items;
}

export const handnewsNewsProvider: NewsSourceProvider = {
  sourceKey: "handnews",
  sourceType: "MEDIA_SITE",

  async fetchNews(): Promise<ScrapedNewsItem[]> {
    let res: Response;
    try {
      res = await globalThis.fetch(LISTING_URL, {
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": USER_AGENT },
      });
    } catch (e) {
      throw new IngestionError(`handnews : requête réseau échouée (${String(e)})`, "handnews", true);
    }
    if (!res.ok) {
      throw new IngestionError(`handnews : HTTP ${res.status} sur ${LISTING_URL}`, "handnews", true);
    }

    const html = await res.text();
    const items = parseListing(html);
    if (items.length === 0) {
      throw new IngestionError("handnews : aucun article Starligue récupéré (parsing cassé ?)", "handnews", true);
    }

    return items;
  },

  // Corps délimité par class="ds-c-single-content ds-c-wysisyg" jusqu'au
  // <div class="clear"/> qui referme systématiquement le bloc (vérifié en direct).
  async fetchArticleContent(sourceUrl: string): Promise<string | null> {
    try {
      const res = await globalThis.fetch(sourceUrl, {
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": USER_AGENT },
      });
      if (!res.ok) return null;

      const html = await res.text();
      const match = html.match(/ds-c-single-content ds-c-wysisyg">([\s\S]*?)<div class="clear"\/>/);
      if (!match) return null;

      return htmlToPlainContent(match[1]!);
    } catch {
      return null;
    }
  },
};
