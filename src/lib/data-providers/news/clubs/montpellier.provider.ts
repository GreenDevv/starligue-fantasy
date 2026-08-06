// Montpellier Handball — pas de WordPress (aucun /wp-json, en-tête serveur "PHP/5.6" +
// cookie "PHPSESSID"), CMS custom mais HTML serveur classique (pas de SPA). Reconnaissance
// faite le 2026-08-06 : https://www.montpellierhandball.com/fr/actualites liste ~20 cartes
// sur une seule page (class="content-item item-small"), pas de pagination nécessaire — le
// cron ignore de toute façon tout item publié avant aujourd'hui (voir src/lib/news/sync.ts).
//
// Piège hrefs : relatifs SANS slash de tête ("fr/actualites/...", pas "/fr/actualites/...") —
// SITE + "/" + href, jamais une simple concaténation SITE + href.
//
// Dates en clair sur le listing, format court "DD/MM/YYYY" (pas d'heure) — contrairement à
// hbcnantes.com qui écrit les mois en toutes lettres, ici c'est juste du slash-numérique.
//
// Titre de carte parfois tronqué par le CMS lui-même ("..." final) pour les titres longs —
// même valeur tronquée dans l'attribut alt de l'image, donc pas de source "propre" sans
// fetch supplémentaire par item à chaque cycle (pas fait ici, cohérent avec le contrat
// fetchNews() appelé pour toute la liste à chaque run, pas seulement les nouveautés).
//
// Corps d'article : HTML riche multi-blocs (texte + images intercalées, pas un seul bloc
// <p> continu) dans <... itemprop="articleBody">, qui se referme avec </article> (marqueur
// fiable, un seul par page, vérifié en reconnaissance) — htmlToPlainContent ne retient de
// toute façon que les <p>/<li>/<h*> et ignore les blocs image, donc pas besoin de délimiter
// plus finement que cette plage.
//
// ⚠️ Reconnaissance 2026-08-06 : la page contient une chaîne suspecte injectée dans un
// libellé de lien du footer ("Présentation</title><script src=https://mptjs.site/...></script>",
// répétée 3x, probablement un menu partagé desktop/mobile) — indice possible de site club
// compromis (skimmer/malware injection), à signaler à l'utilisateur/au club, sans rapport
// avec notre code. Sans incidence ici : on ne fait jamais de dangerouslySetInnerHTML sur du
// contenu scrapé (voir src/lib/news/html-to-text.ts), le extractArticleBody ci-dessous ne
// retient que du texte de <p>/<li>/<h*> dans une plage qui exclut le footer, et le tag
// <script> lui-même serait de toute façon strippé comme n'importe quelle balise.
import { IngestionError } from "../../lnh-scraper.provider";
import { htmlToPlainContent } from "@/lib/news/html-to-text";
import type { NewsSourceProvider, ScrapedNewsItem } from "../types";

const SITE = "https://www.montpellierhandball.com";
const LISTING_URL = `${SITE}/fr/actualites`;
const USER_AGENT = "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)";

// Même table que src/lib/news/html-to-text.ts (entités Latin-1 nommées, HTML4) —
// nécessaire ici aussi : "&#39;", "&eacute;", "&agrave;" observés sur les titres de carte.
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

// "05/08/2026" → Date (pas d'heure disponible sur le listing, minuit par défaut).
// Format inattendu → now() (jamais fatal, cf. contrat ScrapedNewsItem).
function parseSlashDate(text: string): Date {
  const m = text.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return new Date();
  const day = Number(m[1]);
  const month = Number(m[2]) - 1;
  const year = Number(m[3]);
  return new Date(year, month, day);
}

interface RawCard {
  href: string;
  block: string;
}

function extractCards(html: string): RawCard[] {
  const re = /<a class="content-item item-small" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const cards: RawCard[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    cards.push({ href: m[1]!, block: m[2]! });
  }
  return cards;
}

// Titre + date vivent dans le même bloc <div class="title">…titre…<div class="date">…</div></div>
// (pas de séparateur propre) — un seul regex capture les deux d'un coup.
function extractTitleAndDate(block: string): { title: string; dateText: string } | null {
  const m = block.match(/class="title">\s*([\s\S]*?)<div class="date">\s*([^<]*)<\/div>/);
  if (!m) return null;
  const title = decodeHtmlEntities(m[1]!.replace(/\s+/g, " ").trim());
  const dateText = m[2]!.trim();
  if (!title || !dateText) return null;
  return { title, dateText };
}

function extractImage(block: string): string | null {
  const m = block.match(/<img src="([^"]*)"/);
  return m?.[1] || null;
}

function parseListing(html: string): ScrapedNewsItem[] {
  const items: ScrapedNewsItem[] = [];

  for (const card of extractCards(html)) {
    const parsed = extractTitleAndDate(card.block);
    if (!parsed) continue;

    items.push({
      title: parsed.title,
      excerpt: null,
      content: null, // page de listing seule — fetchArticleContent() récupère le texte intégral
      sourceUrl: `${SITE}/${card.href}`,
      imageUrl: extractImage(card.block),
      publishedAt: parseSlashDate(parsed.dateText),
      clubExternalSlug: "montpellier",
    });
  }

  return items;
}

export const montpellierNewsProvider: NewsSourceProvider = {
  sourceKey: "montpellier",
  sourceType: "CLUB_SITE",

  async fetchNews(): Promise<ScrapedNewsItem[]> {
    let res: Response;
    try {
      res = await globalThis.fetch(LISTING_URL, {
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": USER_AGENT },
      });
    } catch (e) {
      throw new IngestionError(`montpellier : requête réseau échouée (${String(e)})`, "montpellier", true);
    }
    if (!res.ok) {
      throw new IngestionError(`montpellier : HTTP ${res.status} sur ${LISTING_URL}`, "montpellier", true);
    }

    const html = await res.text();
    const items = parseListing(html);
    if (items.length === 0) {
      throw new IngestionError("montpellier : aucun article récupéré (parsing cassé ?)", "montpellier", true);
    }

    return items;
  },

  // Corps riche (texte + images intercalées) entre itemprop="articleBody" et </article> —
  // htmlToPlainContent ne retient que les <p>/<li>/<h*>, les blocs image sont ignorés
  // naturellement, pas besoin de délimiter plus finement.
  async fetchArticleContent(sourceUrl: string): Promise<string | null> {
    try {
      const res = await globalThis.fetch(sourceUrl, {
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": USER_AGENT },
      });
      if (!res.ok) return null;

      const html = await res.text();
      const match = html.match(/itemprop="articleBody">([\s\S]*?)<\/article>/);
      if (!match) return null;

      return htmlToPlainContent(match[1]!);
    } catch {
      return null;
    }
  },
};
