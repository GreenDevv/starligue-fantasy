// Actus lnh.fr (daikin-starligue/actualites) — même recette AJAX que le reste de
// lnh-scraper.provider.ts (CSRF `key` + cookie PHPSESSID capturés sur la page HTML,
// POST sur /ajaxpost1), reconnaissance faite en direct le 2026-07-23 :
// contents_controller="news", contents_action="index_ajax", univers="d1-26623",
// type="press" (la page daikin-starligue/actualites n'affiche QUE la Starligue,
// pas besoin de filtrage supplémentaire — même garantie déjà observée pour le
// calendrier/classement/stats sur ce univers). Réponse : fragment HTML, pas de JSON —
// parsing par regex, cohérent avec le reste du fichier lnh-scraper.provider.ts (pas
// de cheerio dans ce projet).
import { IngestionError } from "../lnh-scraper.provider";
import { htmlToPlainContent } from "@/lib/news/html-to-text";
import type { NewsSourceProvider, ScrapedNewsItem } from "./types";

const LNH_BASE = "https://www.lnh.fr";
const ACTUALITES_URL = `${LNH_BASE}/daikin-starligue/actualites`;
const AJAX_URL = `${LNH_BASE}/ajaxpost1`;
const UNIVERS = "d1-26623";
const USER_AGENT = "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)";
const MAX_PAGES = 3; // 3×12 = 36 derniers articles, largement suffisant pour un run quotidien (idempotent au-delà)

interface FormContext {
  key: string;
  cookie: string;
}

async function getFormContext(): Promise<FormContext | null> {
  try {
    const res = await globalThis.fetch(ACTUALITES_URL, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return null;

    const html = await res.text();
    const keyMatch = html.match(/name="key"\s+value="(\d+)"/);
    const cookie = res.headers.get("set-cookie") ?? "";
    if (!keyMatch) return null;

    return { key: keyMatch[1]!, cookie };
  } catch {
    return null;
  }
}

async function fetchNewsPage(page: number, ctx: FormContext): Promise<string | null> {
  const body = new URLSearchParams({
    contents_controller: "news",
    contents_action: "index_ajax",
    "pagination-order": "articles_date DESC, articles_id DESC",
    "pagination-items": "12",
    "pagination-current": String(page),
    key: ctx.key,
    type: "press",
    univers: UNIVERS,
  });

  try {
    const res = await globalThis.fetch(AJAX_URL, {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": USER_AGENT,
        ...(ctx.cookie ? { Cookie: ctx.cookie } : {}),
      },
      body: body.toString(),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// Slug club depuis l'URL du logo, ex "sports_teams/montpellier__logo__2025-2026.png"
// → "montpellier" — même regex que extractClubSlug() dans lnh-scraper.provider.ts,
// dupliquée volontairement (chaque provider d'actus est autonome, cf. les futurs
// providers club).
function extractClubSlug(logoUrl: string): string | undefined {
  const m = logoUrl.match(/sports_teams\/([^_]+)__logo__/);
  return m?.[1];
}

// "Publié il y a 96 jours" / "il y a 1 jour" → Date (résolution au jour près, ce qui
// suffit à la fois pour l'affichage et pour la fenêtre de dédoublonnage cross-source,
// src/lib/news/dedupe.ts). Format non reconnu (ex: article du jour même, si le site
// utilise une autre formulation) → now().
function parseRelativeDate(text: string): Date {
  const m = text.match(/il y a (\d+)\s*jours?/i);
  if (!m) return new Date();
  const days = Number(m[1]);
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export function parseNewsFromHtml(html: string): ScrapedNewsItem[] {
  const items: ScrapedNewsItem[] = [];
  const itemRegex =
    /<a class="news-item[^"]*"\s+href="([^"]+)"[^>]*>\s*<div class="picture" style="background-image: url\('([^']*)'\);">\s*<\/div>\s*<div class="title">\s*([\s\S]*?)\s*<\/div>\s*<div class="row-infos">\s*<div class="logo"><img src="([^"]*)"[^>]*><\/div>\s*<div class="datetime">([^<]*)<\/div>/g;

  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(html)) !== null) {
    const sourceUrl = m[1]!;
    const imageUrl = m[2]! || null;
    const title = decodeHtmlEntities(m[3]!.trim());
    const logoUrl = m[4]!;
    const datetimeText = m[5]!.trim();

    if (!title || !sourceUrl) continue;

    items.push({
      title,
      excerpt: null,
      content: null, // page de listing seule — fetchArticleContent() récupère le texte intégral, à la demande
      sourceUrl,
      imageUrl,
      publishedAt: parseRelativeDate(datetimeText),
      clubExternalSlug: extractClubSlug(logoUrl),
    });
  }

  return items;
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

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&([a-z]+);/gi, (full: string, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? full);
}

export const lnhNewsProvider: NewsSourceProvider = {
  sourceKey: "lnh",
  sourceType: "LNH_SITE",

  async fetchNews(): Promise<ScrapedNewsItem[]> {
    const ctx = await getFormContext();
    if (!ctx) {
      throw new IngestionError("lnh-news : impossible de récupérer le contexte CSRF/cookie", "lnh-news", true);
    }

    const items: ScrapedNewsItem[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const html = await fetchNewsPage(page, ctx);
      if (!html) break;
      const pageItems = parseNewsFromHtml(html);
      if (pageItems.length === 0) break;
      items.push(...pageItems);
    }

    if (items.length === 0) {
      throw new IngestionError("lnh-news : aucun article récupéré (parsing cassé ?)", "lnh-news", true);
    }

    return items;
  },

  // Contrairement à la page de listing (AJAX/shell JS), une page d'article individuelle
  // lnh.fr est du HTML statique classique (confirmé en reconnaissance le 2026-07-23) —
  // en fait un miroir/syndication du contenu WordPress du club d'origine (note le
  // paragraphe "L'article ... est apparu en premier sur <club>" en fin de page, filtré
  // par htmlToParagraphs). Le corps est délimité par itemprop="articleBody" jusqu'au
  // bloc "article-teams-flux" suivant (lien vers l'article original côté club) — motif
  // vérifié identique sur 2 articles de clubs différents.
  async fetchArticleContent(sourceUrl: string): Promise<string | null> {
    try {
      const res = await globalThis.fetch(sourceUrl, {
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": USER_AGENT },
      });
      if (!res.ok) return null;

      const html = await res.text();
      const match = html.match(/itemprop="articleBody"[^>]*>([\s\S]*?)<div class="article-teams-flux">/);
      if (!match) return null;

      return htmlToPlainContent(match[1]!);
    } catch {
      return null;
    }
  },
};
