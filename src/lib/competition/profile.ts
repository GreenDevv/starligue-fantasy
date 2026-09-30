// Profil de compétition — ARCHITECTURE.md §35.
//
// Le même code sert deux jeux déployés séparément (un service Railway + une base
// par jeu) : Starligue Fantasy (D1 masculine, LNH) et sa déclinaison Ligue
// Butagaz Énergie (D1 féminine, LFH). Le jeu servi est choisi au BUILD par
// NEXT_PUBLIC_COMPETITION ("LNH" par défaut) — NEXT_PUBLIC_ pour que les
// composants client lisent la même valeur que le serveur (inlinée par Next).
//
// Tout ce qui diffère entre les deux jeux passe par ce profil : source de données,
// provenance de la note, fonctionnalités disponibles, libellés de marque. Le
// reste du code (effectif, alignement, scoring, ligues…) ne connaît pas la
// compétition. Fonction PURE (lit seulement l'env passé en paramètre).

import { z } from "zod";

export const COMPETITION_IDS = ["LNH", "LFH"] as const;
export type CompetitionId = (typeof COMPETITION_IDS)[number];

// Provenance de PlayerMatchStat.lnhRating (nom de colonne historique) :
// - LNH_OFFICIAL : « Score LNH » publié par lnh.fr sur la feuille de match ;
// - COMPUTED : calculée par nous depuis les stats du match
//   (src/lib/scoring/computed-rating.ts), la LFH ne publiant aucune note.
export type RatingSource = "LNH_OFFICIAL" | "COMPUTED";

export interface CompetitionFeatures {
  liveFeed: boolean; // notes/évènements en direct (cron sync-live, flux lnh.fr)
  officialRatingCorrections: boolean; // corrections a posteriori (/admin/lnh-corrections)
  warmupMatches: boolean; // matchs de préparation (§19)
  coupeDeFrance: boolean;
  europeanCups: boolean; // EHF Champions League / European League (§19.2)
  auctionMode: boolean; // §18
  instagram: boolean; // posts/reels automatiques (§17)
}

export interface CompetitionProfile {
  id: CompetitionId;
  gender: "M" | "F";
  siteName: string; // nom du site (en-tête, titres d'onglet) — « Handball Fantasy » côté Starligue
  appName: string; // nom du jeu (appli installée, écran d'intro, emails)
  leagueName: string; // nom du championnat tel qu'affiché sur le site
  leagueShortName: string; // libellé court dans l'UI (« Starligue », « Ligue Butagaz »)
  federationShortName: string; // « LNH » | « LFH »
  ratingSource: RatingSource;
  features: CompetitionFeatures;
  // Lignes de stats (src/lib/stats/stat-lines.ts) que la source ne publie pas :
  // retirées partout (tableaux, leaders, graphiques, bonus « leader de journée »).
  unavailableStatKeys: string[];
  // Stats affichées par défaut dans les panneaux de leaders (avant tout choix de l'utilisateur).
  defaultStatKeys: string[];
}

const PROFILES: Record<CompetitionId, CompetitionProfile> = {
  LNH: {
    id: "LNH",
    gender: "M",
    siteName: "Handball Fantasy",
    appName: "Starligue Fantasy",
    leagueName: "Daikin StarLigue",
    leagueShortName: "Starligue",
    federationShortName: "LNH",
    ratingSource: "LNH_OFFICIAL",
    unavailableStatKeys: [],
    defaultStatKeys: ["goalsTotal", "assists", "ballsRecovered", "neutralizations"],
    features: {
      liveFeed: true,
      officialRatingCorrections: true,
      warmupMatches: true,
      coupeDeFrance: true,
      europeanCups: true,
      auctionMode: true,
      instagram: true,
    },
  },
  LFH: {
    id: "LFH",
    gender: "F",
    siteName: "LBE Fantasy",
    appName: "LBE Fantasy",
    leagueName: "Ligue Butagaz Énergie",
    leagueShortName: "Ligue Butagaz",
    federationShortName: "LFH",
    ratingSource: "COMPUTED",
    // Feuille officielle LFH + vision-sport : ni passes, ni ballons récupérés, ni
    // pertes, ni 7 m / 2 min provoqués, ni contres, ni neutralisations (§35.2).
    unavailableStatKeys: [
      "assists",
      "ballsRecovered",
      "opponentShotsBlocked",
      "penaltiesDrawn",
      "twoMinDrawn",
      "neutralizations",
      "turnovers",
    ],
    defaultStatKeys: ["goalsTotal", "shotPercentage", "saves", "savePercentage"],
    // Lot 1 : aucune des fonctionnalités adossées à des flux lnh.fr n'a
    // d'équivalent LFH branché. À rouvrir une par une (voir §35.5).
    features: {
      liveFeed: false,
      officialRatingCorrections: false,
      warmupMatches: false,
      coupeDeFrance: false,
      europeanCups: false,
      auctionMode: false,
      instagram: false,
    },
  },
};

const competitionIdSchema = z.enum(COMPETITION_IDS);

/**
 * Compétition servie par ce déploiement. Valeur absente → "LNH" (le jeu
 * historique ne doit rien avoir à configurer). Valeur inconnue → erreur
 * explicite plutôt qu'un repli silencieux sur le mauvais jeu.
 */
export function getCompetitionId(
  env: Record<string, string | undefined> = { NEXT_PUBLIC_COMPETITION: process.env.NEXT_PUBLIC_COMPETITION }
): CompetitionId {
  const raw = env.NEXT_PUBLIC_COMPETITION?.trim();
  if (!raw) return "LNH";
  const parsed = competitionIdSchema.safeParse(raw.toUpperCase());
  if (!parsed.success) {
    throw new Error(`NEXT_PUBLIC_COMPETITION invalide : "${raw}" (attendu : ${COMPETITION_IDS.join(" | ")})`);
  }
  return parsed.data;
}

export function getCompetitionProfile(id: CompetitionId = getCompetitionId()): CompetitionProfile {
  return PROFILES[id];
}

/** URL publique du site (NEXT_PUBLIC_APP_URL), sans protocole ni « / » final — ex. « starliguefantasy.fr/lbe ». */
export function siteDisplayUrl(appUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL): string {
  return (appUrl ?? "https://starliguefantasy.fr").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * Clé de stockage navigateur (localStorage) propre au jeu servi. Les deux jeux
 * partagent le même domaine (starliguefantasy.fr et starliguefantasy.fr/lbe),
 * donc le même stockage : sans préfixe, les préférences Starligue (ex. stats
 * « passes décisives ») s'appliqueraient au jeu LBE. Clé Starligue inchangée pour
 * ne faire perdre aucune préférence existante.
 */
export function competitionStorageKey(key: string, id: CompetitionId = getCompetitionId()): string {
  return id === "LNH" ? key : `${id.toLowerCase()}:${key}`;
}
