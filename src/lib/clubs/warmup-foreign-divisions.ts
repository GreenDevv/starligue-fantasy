// Divisions de clubs étrangers apparus dans des matchs Warm Up (ARCHITECTURE.md
// §19) dont l'URL lnh.fr ne porte aucun segment de division (contrairement aux
// clubs français de Proligue, ex: "proligue/equipes/…" — voir
// ScrapedWarmupMatch.homeClubDivision). Connaissance générale du handball européen/
// international, PAS une donnée scrapée — best-effort, tenu à jour manuellement.
// Un club absent de cette table reste simplement sans info de division plutôt que
// d'en deviner une à tort (ex: Molsheim, club français dont l'URL lnh.fr n'a
// pourtant pas de segment de division connu — pas assez de certitude pour l'inclure
// ici sans le confondre avec un vrai club étranger).
export const WARMUP_FOREIGN_CLUB_DIVISIONS: Record<string, string> = {
  "rhein-neckar": "1ère division allemande",
  wetzlar: "1ère division allemande",
  plock: "1ère division polonaise",
  "suhr-aarau": "1ère division suisse",
  "rtv-1879-basel": "1ère division suisse",
  szeged: "1ère division hongroise",
  tatabanya: "1ère division hongroise",
  "toyoda-gosei": "1ère division japonaise",
};
