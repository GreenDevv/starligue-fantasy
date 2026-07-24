// Convertit le HTML riche d'un article scrapé (lnh.fr syndique en fait le contenu
// WordPress des clubs, cf. mémoire projet) en texte pur, paragraphe par paragraphe —
// jamais de HTML stocké/rendu tel quel : le contenu vient de sites tiers, un
// dangerouslySetInnerHTML dessus serait une porte ouverte à l'injection si jamais un
// site source est compromis ou embarque un script. React échappe du texte brut par
// nature, donc aucune sanitization HTML n'est nécessaire avec cette approche.
const BLOCK_TAG_REGEX = /<(p|li|h[1-6]|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;

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

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&([a-z]+);/gi, (full: string, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? full);
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

// WordPress ajoute cette ligne d'attribution à chaque article syndiqué via un flux
// RSS (constaté sur les articles club relayés par lnh.fr) — cruft promotionnel, pas
// du contenu éditorial, à exclure du corps affiché.
function isFeedAttributionBoilerplate(text: string): boolean {
  return /^L.article .* est apparu en premier sur/i.test(text);
}

/** Liste de paragraphes (texte pur, un par bloc p/li/heading/blockquote) — vide si aucun. */
export function htmlToParagraphs(html: string): string[] {
  const paragraphs: string[] = [];
  let m: RegExpExecArray | null;
  BLOCK_TAG_REGEX.lastIndex = 0;
  while ((m = BLOCK_TAG_REGEX.exec(html)) !== null) {
    const text = stripTags(m[2]!);
    if (text.length === 0) continue;
    if (isFeedAttributionBoilerplate(text)) continue;
    paragraphs.push(text);
  }
  return paragraphs;
}

/** Paragraphes joints par un double saut de ligne — prêt pour NewsItem.content. */
export function htmlToPlainContent(html: string): string | null {
  const paragraphs = htmlToParagraphs(html);
  return paragraphs.length > 0 ? paragraphs.join("\n\n") : null;
}
