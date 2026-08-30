// Provider de l'annuaire des clubs FFHandball — ARCHITECTURE.md §23.3.
//
// monclub.ffhandball.fr (WordPress + plugin smartfire-blocks-project-library)
// n'expose AUCUNE API REST pour les clubs. Recon du 2026-08-30 :
//   - la liste complète des ~2300 fiches est dans 3 sitemaps XML
//     (smartfire-clubs-sitemap{,2,3}.xml, référencés par /sitemap.xml) ;
//   - chaque fiche /clubs/<slug>/ est rendue côté serveur (fetch simple, pas de
//     headless) et embarque un blob JSON dans un attribut HTML `attributes="{…}"`
//     du bloc smartfire, encodé en entités HTML (&quot; etc.). Après décodage +
//     JSON.parse : .post.post_title (nom), .post.post_name (slug), .post.acf.*
//     (adresse, géo, site, réseaux, email — l'email contient le nº d'affiliation
//     FFHandball du club, ex "6249056@ffhandball.net").
//
// Voir aussi la mémoire projet `ffhandball-club-directory-scraping`.

import { z } from "zod";
import { IngestionError } from "./lnh-scraper.provider";

const SOURCE = "ffhandball-monclub";
const BASE_URL = "https://monclub.ffhandball.fr";
const USER_AGENT = "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)";
const FETCH_TIMEOUT_MS = 15_000;

export interface ExternalHandballClub {
  ffhandballId: string | null; // nº d'affiliation (préfixe de email_club), null si absent
  ffhandballHash: string; // acf.club_hash (md5), toujours présent
  name: string;
  slug: string;
  address: string | null;
  zipcode: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  facebook: string | null;
  instagram: string | null;
}

export interface FfhandballClubsProvider {
  name: typeof SOURCE;
  fetchClubSlugs(): Promise<string[]>;
  fetchClub(slug: string): Promise<ExternalHandballClub | null>;
}

// --- Décodage des entités HTML de l'attribut `attributes="…"` ------------------
// L'attribut est produit par esc_attr()/wp_json_encode() côté WordPress : les
// seules entités attendues sont &quot; &#039; &amp; &lt; &gt; (+ &#NN; numériques
// par prudence). On ne réutilise pas html-to-text.ts : ici on veut un JSON
// intact, pas du texte de paragraphe.
export function decodeHtmlAttribute(raw: string): string {
  return raw
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// --- Parsing d'une fiche club --------------------------------------------------

const acfSchema = z
  .object({
    club_hash: z.string().min(1),
    address_club: z.string().nullish(),
    address_club_2: z.string().nullish(),
    zipcode_club: z.string().nullish(),
    city_club: z.string().nullish(),
    latitude_club: z.union([z.string(), z.number()]).nullish(),
    longitude_club: z.union([z.string(), z.number()]).nullish(),
    url_club: z.string().nullish(),
    email_club: z.string().nullish(),
    facebook_club: z.string().nullish(),
    instagram_club: z.string().nullish(),
  })
  .passthrough();

const clubBlobSchema = z.object({
  post: z
    .object({
      post_title: z.string().min(1),
      post_name: z.string().min(1),
      acf: acfSchema,
    })
    .passthrough(),
});

function cleanStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function toCoord(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

// email_club = "6249056@ffhandball.net" → "6249056" (nº d'affiliation). Certains
// clubs ont un email personnalisé (contact@...) : dans ce cas, pas d'ID exploitable.
function affiliationIdFromEmail(email: string | null): string | null {
  if (!email) return null;
  const m = email.match(/^(\d{4,})@/);
  return m ? (m[1] ?? null) : null;
}

/** Extrait un `ExternalHandballClub` du HTML d'une fiche `/clubs/<slug>/`. */
export function parseClubFromHtml(html: string, slug: string): ExternalHandballClub {
  // L'attribut `attributes="…"` qui porte le blob est celui qui contient
  // `&quot;club_hash&quot;`. Comme le contenu est entièrement entity-encodé, il
  // n'y a aucun `"` brut à l'intérieur : `attributes="([^"]*)"` suffit.
  const anchor = html.indexOf("club_hash");
  if (anchor === -1) {
    throw new IngestionError(`${SOURCE}/${slug} : bloc club introuvable (pas de club_hash)`, SOURCE, true);
  }
  const attrStart = html.lastIndexOf('attributes="', anchor);
  if (attrStart === -1) {
    throw new IngestionError(`${SOURCE}/${slug} : attribut 'attributes=' introuvable`, SOURCE, true);
  }
  const valueStart = attrStart + 'attributes="'.length;
  const valueEnd = html.indexOf('"', valueStart);
  if (valueEnd === -1) {
    throw new IngestionError(`${SOURCE}/${slug} : attribut 'attributes=' non terminé`, SOURCE, true);
  }

  const decoded = decodeHtmlAttribute(html.slice(valueStart, valueEnd));

  let json: unknown;
  try {
    json = JSON.parse(decoded);
  } catch {
    throw new IngestionError(`${SOURCE}/${slug} : blob JSON illisible`, SOURCE, true);
  }

  const parsed = clubBlobSchema.safeParse(json);
  if (!parsed.success) {
    throw new IngestionError(
      `${SOURCE}/${slug} : blob JSON inattendu (${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message})`,
      SOURCE,
      true,
    );
  }

  const { post } = parsed.data;
  const acf = post.acf;
  const email = cleanStr(acf.email_club);

  return {
    ffhandballId: affiliationIdFromEmail(email),
    ffhandballHash: acf.club_hash,
    name: post.post_title.replace(/\s+/g, " ").trim(),
    slug: post.post_name || slug,
    address: cleanStr(acf.address_club),
    zipcode: cleanStr(acf.zipcode_club),
    city: cleanStr(acf.city_club),
    latitude: toCoord(acf.latitude_club),
    longitude: toCoord(acf.longitude_club),
    website: cleanStr(acf.url_club),
    facebook: cleanStr(acf.facebook_club),
    instagram: cleanStr(acf.instagram_club),
  };
}

// --- Parsing des sitemaps -----------------------------------------------------

/** Renvoie les URLs des sous-sitemaps "clubs" listées par l'index /sitemap.xml. */
export function parseClubSitemapUrls(sitemapIndexXml: string): string[] {
  return [...sitemapIndexXml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
    .map((m) => m[1] as string)
    .filter((url) => /smartfire-clubs-sitemap\d*\.xml$/i.test(url));
}

/** Renvoie les slugs de club (`/clubs/<slug>/`) listés dans un sous-sitemap. */
export function parseClubSlugs(sitemapXml: string): string[] {
  const slugs = [...sitemapXml.matchAll(/<loc>\s*[^<\s]*\/clubs\/([^/<\s]+)\/?\s*<\/loc>/g)].map(
    (m) => m[1] as string,
  );
  return [...new Set(slugs)];
}

// --- Fetch --------------------------------------------------------------------

async function fetchText(url: string): Promise<string> {
  let res: Response;
  try {
    res = await globalThis.fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT },
    });
  } catch (e) {
    throw new IngestionError(`${SOURCE} : requête réseau échouée sur ${url} (${String(e)})`, SOURCE, true);
  }
  if (res.status === 404) {
    throw new IngestionError(`${SOURCE} : 404 sur ${url}`, SOURCE, false);
  }
  if (!res.ok) {
    throw new IngestionError(`${SOURCE} : HTTP ${res.status} sur ${url}`, SOURCE, true);
  }
  return res.text();
}

export function createFfhandballClubsProvider(): FfhandballClubsProvider {
  return {
    name: SOURCE,

    async fetchClubSlugs(): Promise<string[]> {
      const index = await fetchText(`${BASE_URL}/sitemap.xml`);
      const subSitemaps = parseClubSitemapUrls(index);
      if (subSitemaps.length === 0) {
        throw new IngestionError(`${SOURCE} : aucun sitemap "clubs" dans l'index`, SOURCE, true);
      }
      const all: string[] = [];
      for (const url of subSitemaps) {
        all.push(...parseClubSlugs(await fetchText(url)));
      }
      return [...new Set(all)];
    },

    async fetchClub(slug: string): Promise<ExternalHandballClub | null> {
      let html: string;
      try {
        html = await fetchText(`${BASE_URL}/clubs/${encodeURIComponent(slug)}/`);
      } catch (e) {
        if (e instanceof IngestionError && !e.recoverable) return null; // 404 = fiche disparue
        throw e;
      }
      return parseClubFromHtml(html, slug);
    },
  };
}

// --- Utilitaire de concurrence (pas de dépendance p-limit) -------------------

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i] as T, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
