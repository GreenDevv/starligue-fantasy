// PSG Handball (Paris Saint-Germain) — pas de site club dédié (contrairement aux autres
// clubs de ce dossier) : le handball est hébergé sous psg.fr, un front Next.js/SPA.
// Reconnaissance faite le 2026-07-29 : la page https://www.psg.fr/actualite embarque le
// payload React Server Components d'un composant "Handball" qui interroge une API
// headless Umbraco Content Delivery, exposée publiquement sur api.psg.fr (contrairement
// à www.psg.fr qui renvoie 403 sur ce même endpoint côté fetch serveur — WAF anti-scraping
// probable sur le domaine principal uniquement). Query reconstruite à l'identique
// (filter=universe:<id Handball> + les mêmes category ids que tout le site).
//
// Corps d'article : pas de HTML, format JSON arborescent propriétaire du CMS
// (richTextGenericAdvancedBlock -> text.elements[].elements[].text) — extractParagraphs()
// ci-dessous en fait le tour récursivement, dans le même esprit que htmlToPlainContent
// mais pour ce format spécifique. Images : Cloudinary sans URL directe dans l'API,
// seulement un public_id — reconstruites via le domaine média du club (media.psg.fr,
// vu en clair sur des images du site), vérifié en direct (HTTP 200, image/jpeg).
import { IngestionError } from "../../lnh-scraper.provider";
import type { NewsSourceProvider, ScrapedNewsItem } from "../types";

const API_URL = "https://api.psg.fr/umbraco/delivery/api/v2/content";
const USER_AGENT = "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)";
const TAKE = 20;

// Ids stables côté CMS PSG (universe "Handball" + les catégories actus utilisées par le
// sélecteur "Handball" de https://www.psg.fr/actualite) — pas de constante publique
// documentée, capturés en reconnaissance directe sur le payload de la page.
const HANDBALL_UNIVERSE_ID = "a2fcec87-56be-491c-b249-ea867330247d";
const CATEGORY_IDS = [
  "8b3b5657-5723-4008-b69e-08dd6210d0e5",
  "c55d0a58-171f-47b3-b69f-08dd6210d0e5",
  "e7a45217-d2cf-4b6e-b6a0-08dd6210d0e5",
  "a376c10d-9088-4087-b6a1-08dd6210d0e5",
  "927bc1bc-22bb-4f44-b6a2-08dd6210d0e5",
  "24ccce94-0185-434e-b6a3-08dd6210d0e5",
  "62ad5753-f0ae-4b2f-b6a4-08dd6210d0e5",
  "de634fb2-8026-4508-b6a5-08dd6210d0e5",
  "b8df68c8-b117-4d73-b6a6-08dd6210d0e5",
  "9a73c42e-f3fb-4e83-b6a7-08dd6210d0e5",
  "61bc88b3-e1f9-42f5-b6a8-08dd6210d0e5",
  "5107e4ba-f51b-4711-b6aa-08dd6210d0e5",
  "d7e3c39b-a6eb-4036-b6ab-08dd6210d0e5",
  "597658c9-faf0-4274-b6ac-08dd6210d0e5",
  "3824371b-04de-4194-b6ad-08dd6210d0e5",
  "fcc5affd-5068-43d0-b6ae-08dd6210d0e5",
  "1ab82992-2459-478f-b6af-08dd6210d0e5",
  "fce889c5-dd38-462d-1675-08ddcf6004fa",
];

function buildUrl(): string {
  const params = new URLSearchParams();
  params.append("filter", "contentType:articlePage,videoDetailPage,gallery");
  params.append("filter", `universe:${HANDBALL_UNIVERSE_ID}`);
  params.append("filter", `category:${CATEGORY_IDS.join(",")}`);
  params.append("sort", "createDate:desc");
  params.append("take", String(TAKE));
  return `${API_URL}?${params.toString()}`;
}

interface CloudinaryImage {
  public_id: string;
}

interface RichTextNode {
  tag?: string;
  text?: string;
  elements?: RichTextNode[];
}

// &nbsp; observé dans les données réelles (ex: "collectivement.&nbsp;") — table minimale,
// même esprit que les autres providers du dossier.
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

function decodeEntities(text: string): string {
  return text.replace(/&([a-z]+);/gi, (full, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? full);
}

function collectText(node: RichTextNode, out: string[]): void {
  if (typeof node.text === "string") {
    out.push(decodeEntities(node.text));
    return;
  }
  for (const child of node.elements ?? []) {
    collectText(child, out);
  }
}

/** Un paragraphe par bloc racine tag="p" — mêmes garanties que htmlToPlainContent
 *  (vide filtré, pas de HTML). */
function extractParagraphs(root: RichTextNode | undefined): string[] {
  if (!root?.elements) return [];
  const paragraphs: string[] = [];
  for (const block of root.elements) {
    if (block.tag !== "p") continue;
    const parts: string[] = [];
    collectText(block, parts);
    const text = parts.join("").replace(/\s+/g, " ").trim();
    if (text.length > 0) paragraphs.push(text);
  }
  return paragraphs;
}

interface ApiItem {
  contentType: string;
  name: string;
  createDate: string;
  route: { path: string };
  properties: {
    // articlePage : titre/résumé/image dans heroBlock.
    heroBlock?: {
      items?: Array<{
        content?: {
          properties?: {
            headline?: string;
            summary?: string;
            image?: CloudinaryImage[];
          };
        };
      }>;
    };
    modules?: {
      items?: Array<{
        content?: {
          contentType: string;
          properties?: { text?: RichTextNode };
        };
      }>;
    };
    // videoDetailPage : titre/résumé/image directement sur properties (pas de heroBlock).
    headline?: string;
    description?: string;
    image?: CloudinaryImage[];
    // gallery : image + corps texte (pas de heroBlock/modules) sous ces noms-là.
    mainImage?: CloudinaryImage[];
    bodyText?: RichTextNode;
  };
}

interface ApiResponse {
  total: number;
  items: ApiItem[];
}

function toImageUrl(image: CloudinaryImage[] | undefined): string | null {
  const publicId = image?.[0]?.public_id;
  return publicId ? `https://media.psg.fr/image/upload/f_auto,q_auto/${publicId}` : null;
}

export const psgNewsProvider: NewsSourceProvider = {
  // "paris", pas "psg" : doit matcher externalIds.lnh du club en DB (voir prisma/seed.ts),
  // même convention que les autres providers de ce dossier (sourceKey === clubExternalSlug).
  sourceKey: "paris",
  sourceType: "CLUB_SITE",

  async fetchNews(): Promise<ScrapedNewsItem[]> {
    let res: Response;
    try {
      res = await globalThis.fetch(buildUrl(), {
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": USER_AGENT },
      });
    } catch (e) {
      throw new IngestionError(`paris (psg.fr) : requête réseau échouée (${String(e)})`, "paris", true);
    }
    if (!res.ok) {
      throw new IngestionError(`paris (psg.fr) : HTTP ${res.status}`, "paris", true);
    }

    const data = (await res.json()) as ApiResponse;
    if (!Array.isArray(data.items)) {
      throw new IngestionError("paris (psg.fr) : réponse API inattendue (pas de items[])", "paris", true);
    }

    return data.items.map((item) => {
      const props = item.properties;
      const hero = props.heroBlock?.items?.[0]?.content?.properties;

      const title = hero?.headline?.trim() || props.headline?.trim() || item.name;

      // articlePage → summary (heroBlock) ; videoDetailPage → description ; gallery →
      // pas de résumé court dédié, on retombe sur le premier paragraphe de bodyText.
      const excerpt =
        hero?.summary?.trim() ||
        props.description?.trim() ||
        extractParagraphs(props.bodyText)[0] ||
        null;

      // Corps long : uniquement les articlePage ont des modules richText multi-blocs ;
      // les gallery n'ont qu'un bodyText déjà capté ci-dessus comme excerpt (pas de corps
      // séparé à extraire deux fois) ; les videoDetailPage n'ont pas de corps texte.
      const paragraphs = (props.modules?.items ?? [])
        .filter((m) => m.content?.contentType === "richTextGenericAdvancedBlock")
        .flatMap((m) => extractParagraphs(m.content?.properties?.text));
      const content = paragraphs.length > 0 ? paragraphs.join("\n\n") : null;

      const imageUrl = toImageUrl(hero?.image) ?? toImageUrl(props.image) ?? toImageUrl(props.mainImage);

      return {
        title,
        excerpt,
        content,
        sourceUrl: `https://www.psg.fr${item.route.path}`,
        imageUrl,
        publishedAt: new Date(item.createDate),
        clubExternalSlug: "paris",
      };
    });
  },
};
