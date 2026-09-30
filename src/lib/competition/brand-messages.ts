// Marque appliquée aux traductions selon la compétition servie — ARCHITECTURE.md §35.
// Fonctions PURES (aucune lecture de fichier, aucun import Next).
//
// Les fichiers messages/<locale>/*.json sont écrits pour le jeu Starligue. Plutôt
// que de dupliquer les 8 langues pour le jeu LBE, on applique au chargement
// (src/i18n/request.ts) :
//   1. des règles de remplacement communes à toutes les langues (noms propres) ;
//   2. des réécritures par clé, là où un remplacement mot à mot sonnerait faux
//      (« Note LNH » → « Note » : la note LBE est calculée par nous, pas par la LFH).
// Le jeu Starligue ne passe jamais par ici : ses messages restent tels quels.

import type { CompetitionId } from "./profile";

type Messages = { [key: string]: Messages | string };

export interface BrandRule {
  pattern: RegExp;
  replacement: string;
}

// Ordre significatif : les formes longues d'abord (« Daikin StarLigue » avant
// « StarLigue »), sinon la forme courte mangerait la longue.
export const LFH_BRAND_RULES: BrandRule[] = [
  { pattern: /(Daikin|Liqui Moly)[ -]Star[Ll]igue/g, replacement: "Ligue Butagaz Énergie" }, // « Daikin-Starligue » en allemand
  { pattern: /Fantasy Star[Ll]igue/g, replacement: "LBE Fantasy" },
  { pattern: /Starligue Fantasy/g, replacement: "LBE Fantasy" },
  { pattern: /Handball Fantasy/g, replacement: "LBE Fantasy" }, // nom du site (metadata.siteName, emails…)
  { pattern: /Star[Ll]igue/g, replacement: "Ligue Butagaz" },
  { pattern: /\bLNH\b/g, replacement: "LFH" },
  // La note n'est pas sur 10 (formule LNH rétro-ingéniérée, §35.3) : « moy. 13.3/10 » était faux.
  { pattern: /\{rating\}\/10/g, replacement: "{rating}" },
];

// Français au féminin (jeu LBE : joueuses, gardiennes, ailières…). Deux passes :
// les noms avec leur déterminant, puis les accords qui en découlent. L'anglais est
// neutre (« player ») ; les 6 autres langues restent au masculin générique pour
// l'instant (voir ARCHITECTURE.md §35.5). Phrases trop particulières : réécritures
// par clé ci-dessous. Chaque phrase produite est relue dans brand-messages.test.ts.
export const LFH_FEMININE_RULES: Record<string, BrandRule[]> = {
  fr: [
    // 1. Noms et déterminants
    { pattern: /\b([Uu])n joueur\b/g, replacement: "$1ne joueuse" },
    { pattern: /\b([Ll])e joueur\b/g, replacement: "$1a joueuse" },
    { pattern: /\b([Cc])e joueur\b/g, replacement: "$1ette joueuse" },
    { pattern: /\b([Dd])u joueur\b/g, replacement: "$1e la joueuse" },
    { pattern: /\bau joueur\b/g, replacement: "à la joueuse" },
    { pattern: /\b([TtSsMm])on joueur\b/g, replacement: "$1a joueuse" },
    { pattern: /\b([Mm])eilleurs joueurs\b/g, replacement: "$1eilleures joueuses" },
    { pattern: /\b([Mm])eilleur joueur\b/g, replacement: "$1eilleure joueuse" },
    { pattern: /\bvrais joueurs\b/g, replacement: "vraies joueuses" },
    { pattern: /\bJoueurs\b/g, replacement: "Joueuses" },
    { pattern: /\bjoueurs\b/g, replacement: "joueuses" },
    { pattern: /\bJoueur\b/g, replacement: "Joueuse" },
    { pattern: /\bjoueur\b/g, replacement: "joueuse" },
    { pattern: /\b([Gg])ardiens\b/g, replacement: "$1ardiennes" },
    { pattern: /\b([Gg])ardien\b/g, replacement: "$1ardienne" },
    { pattern: /\b([Aa])iliers\b/g, replacement: "$1ilières" },
    { pattern: /\b([Aa])ilier\b/g, replacement: "$1ilière" },
    { pattern: /\b([Uu])n remplaçant\b/g, replacement: "$1ne remplaçante" },
    { pattern: /\b([Ss])on remplaçant\b/g, replacement: "$1a remplaçante" },
    { pattern: /\b([Rr])emplaçants\b/g, replacement: "$1emplaçantes" },
    { pattern: /\b([Rr])emplaçant\b/g, replacement: "$1emplaçante" },
    // 2. Accords
    { pattern: /\b([Aa])ucun joueuse\b/g, replacement: "$1ucune joueuse" },
    { pattern: /\b([Cc])ertains joueuses\b/g, replacement: "$1ertaines joueuses" },
    { pattern: /\bUn des joueuses\b/g, replacement: "Une des joueuses" },
    // (?!e) plutôt que \b : sans flag u, \b ne voit pas la fin d'un mot en « é ».
    { pattern: /\b([Jj])oueuse préféré(?!e)/g, replacement: "$1oueuse préférée" },
    { pattern: /\bjoueuse (blessé|trouvé|enregistré)(?!e)/g, replacement: "joueuse $1e" },
    { pattern: /\bjoueuses (sélectionné|blessé|trouvé)s\b/g, replacement: "joueuses $1es" },
    { pattern: /\b(Ailière|Arrière) droit\b/g, replacement: "$1 droite" },
    { pattern: /\bune joueuse pour le retirer\b/g, replacement: "une joueuse pour la retirer" },
  ],
};

// Réécritures par clé (« namespace.chemin.de.la.clé »), par langue. Une langue
// absente ici garde le résultat des seules règles de remplacement.
export const LFH_KEY_OVERRIDES: Record<string, Record<string, string>> = {
  fr: {
    "metadata.description":
      "LBE Fantasy, jeu de fantasy handball indépendant basé sur le championnat de France de handball D1 féminine (Ligue Butagaz Énergie). Compose ton équipe avec les vraies joueuses et marque des points sur leurs performances réelles.",
    "dashboard.home.metadataDescription":
      "LBE Fantasy : jeu de fantasy handball indépendant basé sur le championnat de France de handball D1 féminine (Ligue Butagaz Énergie). Compose ton équipe avec les vraies joueuses et marque des points sur leurs performances réelles.",
    "dashboard.comingSoon.footerDisclaimer":
      "Projet perso, sans rapport officiel avec la LFH ou la Ligue Butagaz Énergie — ouverture en cours de saison.",
    "dashboard.comingSoon.features.squad.description":
      "14 joueuses parmi les 12 clubs de Ligue Butagaz, un budget serré, un poste à la fois — gardienne, ailières, arrières, demi-centre, pivot.",
    "gameweek.state.PROVISIONAL.detail": "Points confirmés 48 h après le dernier match de la journée",
    "gameweek.correction": "Notes ajustées le {date} — points recalculés",
    "players.detail.noLnhHistory": "Pas d'historique de note sur les saisons précédentes.",
    "players.detail.lnhHistory": "Historique",
    "players.detail.lnhHistoryHeaders.avgScore": "Note moy.",
    "players.recap.rating": "Note",
    "team.history.corrected": "Notes corrigées après relecture des feuilles de match",
    "account.errors.FAVORITE_PLAYER_LOCKED": "La joueuse préférée est définitive une fois déclarée",
    "confidentialite.sections.data.items.favoritePlayer":
      "ta joueuse préférée, si tu choisis d'en indiquer une (facultatif)",
    "dashboard.comingSoon.tagline":
      "Le jeu de <strong>fantasy handball</strong> basé sur les vraies joueuses de la Ligue Butagaz Énergie. Compose ton équipe et marque des points sur leurs vraies performances, journée après journée.",
  },
  en: {
    "metadata.description":
      "LBE Fantasy, an independent fantasy handball game based on the French women's top division (Ligue Butagaz Énergie). Build your team with real players and score points from their real performances.",
    "dashboard.home.metadataDescription":
      "LBE Fantasy: an independent fantasy handball game based on the French women's top division (Ligue Butagaz Énergie). Build your team with real players and score points from their real performances.",
    "gameweek.state.PROVISIONAL.detail": "Points confirmed 48 hours after the last match of the round",
    "players.recap.rating": "Rating",
  },
};

function mapStrings(node: Messages, path: string[], fn: (value: string, key: string) => string): Messages {
  const out: Messages = {};
  for (const [k, v] of Object.entries(node)) {
    const p = [...path, k];
    out[k] = typeof v === "string" ? fn(v, p.join(".")) : mapStrings(v, p, fn);
  }
  return out;
}

export function applyBrand(
  messages: Messages,
  rules: BrandRule[],
  overrides: Record<string, string> = {}
): Messages {
  return mapStrings(messages, [], (value, key) => {
    if (key in overrides) return overrides[key]!;
    return rules.reduce((s, r) => s.replace(r.pattern, r.replacement), value);
  });
}

/** Messages d'une langue pour la compétition servie (inchangés pour la Starligue). */
export function brandMessages<T extends Record<string, unknown>>(messages: T, competition: CompetitionId, locale: string): T {
  if (competition !== "LFH") return messages;
  const rules = [...LFH_BRAND_RULES, ...(LFH_FEMININE_RULES[locale] ?? [])];
  return applyBrand(messages as unknown as Messages, rules, LFH_KEY_OVERRIDES[locale]) as unknown as T;
}
