// HBC Nantes — pas de WordPress (wp-json renvoie 404, confirmé en reconnaissance),
// site custom (PHP, classes CSS "news-card"/"short-news-card", pas de framework JS
// détecté) mais heureusement du HTML serveur classique, pas une SPA. Reconnaissance
// faite le 2026-07-29 : https://hbcnantes.com/actualites/ liste en une seule page
// (sans besoin de paginer ?page=N) deux sections différentes :
//   - la grille "les news" (class="news-card"/"news-card_large") : articles complets,
//     avec image + catégorie, page 1 seulement (~9 items, pagination existe mais
//     inutile ici — voir src/lib/news/sync.ts qui ignore de toute façon tout item
//     publié avant aujourd'hui).
//   - le carrousel "les brèves" (class="short-news-card") : items plus courts, sans
//     image, mais avec un vrai lien vers une page dédiée (même template d'article que
//     la grille) — inclus aussi, ~80 items visibles sur une seule requête.
// Aucun chevauchement d'URL constaté entre les deux sections en reconnaissance directe.
//
// Dates en clair ("22 juillet 2026" ou "29 juillet 2026 15:0" pour les brèves — note :
// le site lui-même affiche "15:0" pour 15h00, format non paddé côté source, pas un bug
// de ce parseur) — parseFrenchDate() ci-dessous, à la place d'un Date.parse() qui ne
// comprend pas les noms de mois français.
//
// Corps d'article : HTML classique dans <div class="actuality__content"> jusqu'au
// bloc suivant "actuality__nav" — réutilise htmlToPlainContent (même contrat que les
// autres providers : jamais de HTML stocké/rendu, paragraphes texte pur uniquement).
import { IngestionError } from "../../lnh-scraper.provider";
import { htmlToPlainContent } from "@/lib/news/html-to-text";
import type { NewsSourceProvider, ScrapedNewsItem } from "../types";

const SITE = "https://hbcnantes.com";
const LISTING_URL = `${SITE}/actualites/`;
const USER_AGENT = "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)";

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
  // Par prudence/cohérence avec src/lib/news/html-to-text.ts (même bug possible sur
  // les titres que sur le corps d'article) même si non observé en reconnaissance.
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  euml: "ë",
  agrave: "à",
  acirc: "â",
  auml: "ä",
  aelig: "æ",
  ccedil: "ç",
  ocirc: "ô",
  ouml: "ö",
  oelig: "œ",
  ucirc: "û",
  uuml: "ü",
  ugrave: "ù",
  icirc: "î",
  iuml: "ï",
  euro: "€",
  laquo: "«",
  raquo: "»",
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&([a-z]+);/gi, (full: string, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? full);
}

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 0,
  février: 1,
  fevrier: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  août: 7,
  aout: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  décembre: 11,
  decembre: 11,
};

// "22 juillet 2026" ou "29 juillet 2026 15:0" (heure non paddée côté source) → Date.
// Mois non reconnu / format inattendu → now() (jamais fatal, cf. contrat ScrapedNewsItem).
function parseFrenchDate(text: string): Date {
  const m = text.trim().match(/^(\d{1,2})\s+([a-zéû]+)\s+(\d{4})(?:\s+(\d{1,2}):(\d{1,2}))?$/i);
  if (!m) return new Date();
  const day = Number(m[1]);
  const month = FRENCH_MONTHS[m[2]!.toLowerCase()];
  const year = Number(m[3]);
  if (month === undefined) return new Date();
  const hour = m[4] ? Number(m[4]) : 0;
  const minute = m[5] ? Number(m[5]) : 0;
  return new Date(year, month, day, hour, minute);
}

interface RawCard {
  href: string;
  block: string;
}

function extractCards(html: string, anchorClass: string): RawCard[] {
  const re = new RegExp(`<a href="([^"]+)" class="[^"]*${anchorClass}[^"]*">([\\s\\S]*?)</a>`, "g");
  const cards: RawCard[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    cards.push({ href: m[1]!, block: m[2]! });
  }
  return cards;
}

function extractField(block: string, cssClass: string): string | null {
  const m = block.match(new RegExp(`${cssClass}[^"]*">\\s*([^<]*)<`));
  const text = m?.[1]?.trim();
  return text ? decodeHtmlEntities(text) : null;
}

function extractImage(block: string): string | null {
  const m = block.match(/<img src="([^"]*)"/);
  return m?.[1] || null;
}

function parseListing(html: string): ScrapedNewsItem[] {
  const items: ScrapedNewsItem[] = [];

  // "news-card" matche aussi "short-news-card" (sous-chaîne) : une seule passe suffit,
  // pas besoin d'appeler extractCards() deux fois avec des classes différentes.
  for (const card of extractCards(html, "news-card")) {
    const title = extractField(card.block, "news-card__title") ?? extractField(card.block, "short-news-card__title");
    const dateText = extractField(card.block, "news-card__date") ?? extractField(card.block, "short-news-card__date");
    if (!title || !dateText) continue;

    items.push({
      title,
      excerpt: null,
      content: null, // page de listing seule — fetchArticleContent() récupère le texte intégral
      sourceUrl: `${SITE}${card.href}`,
      imageUrl: extractImage(card.block),
      publishedAt: parseFrenchDate(dateText),
      clubExternalSlug: "nantes",
    });
  }

  return items;
}

export const nantesNewsProvider: NewsSourceProvider = {
  sourceKey: "nantes",
  sourceType: "CLUB_SITE",

  async fetchNews(): Promise<ScrapedNewsItem[]> {
    let res: Response;
    try {
      res = await globalThis.fetch(LISTING_URL, {
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": USER_AGENT },
      });
    } catch (e) {
      throw new IngestionError(`nantes : requête réseau échouée (${String(e)})`, "nantes", true);
    }
    if (!res.ok) {
      throw new IngestionError(`nantes : HTTP ${res.status} sur ${LISTING_URL}`, "nantes", true);
    }

    const html = await res.text();
    const items = parseListing(html);
    if (items.length === 0) {
      throw new IngestionError("nantes : aucun article récupéré (parsing cassé ?)", "nantes", true);
    }

    return items;
  },

  // Même template d'article pour les deux sections (grille + brèves) : corps délimité
  // par class="actuality__content" jusqu'au bloc "actuality__nav" suivant — vérifié en
  // direct sur un article de la grille.
  async fetchArticleContent(sourceUrl: string): Promise<string | null> {
    try {
      const res = await globalThis.fetch(sourceUrl, {
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": USER_AGENT },
      });
      if (!res.ok) return null;

      const html = await res.text();
      const match = html.match(/class="actuality__content">([\s\S]*?)<div class="actuality__nav/);
      if (!match) return null;

      return htmlToPlainContent(match[1]!);
    } catch {
      return null;
    }
  },
};
