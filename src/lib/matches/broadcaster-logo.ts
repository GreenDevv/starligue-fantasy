// Logo du diffuseur TV officiel (Match.broadcasterName, ARCHITECTURE.md §4.2) —
// téléchargés localement depuis lnh.fr (medias/televisions/{bein-web,htvsmall}_*.png,
// mêmes assets que le site officiel utilise pour ce badge) plutôt que hotlinkés,
// même convention que tous les autres logos du projet (clubs, warmup/EHF hors DB).
// Mapping par nom plutôt que par le slug interne du scraper (BROADCASTER_NAMES,
// privé à lnh-scraper.provider.ts) : Match.broadcasterName est la donnée déjà
// stockée, pas la peine d'exposer/dupliquer le slug juste pour ce lookup.
const BROADCASTER_LOGOS: Record<string, string> = {
  "beIN Sport": "/broadcasters/bein-sport.png",
  "Handball TV": "/broadcasters/handball-tv.png",
};

export function getBroadcasterLogoUrl(broadcasterName: string | null | undefined): string | null {
  if (!broadcasterName) return null;
  return BROADCASTER_LOGOS[broadcasterName] ?? null;
}
