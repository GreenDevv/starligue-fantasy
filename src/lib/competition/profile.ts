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
  appName: string; // nom du jeu (titres, emails)
  leagueName: string; // nom officiel du championnat
  leagueShortName: string; // libellé court dans l'UI (« Starligue », « Ligue Butagaz »)
  federationShortName: string; // « LNH » | « LFH »
  ratingSource: RatingSource;
  features: CompetitionFeatures;
}

const PROFILES: Record<CompetitionId, CompetitionProfile> = {
  LNH: {
    id: "LNH",
    gender: "M",
    appName: "Starligue Fantasy",
    leagueName: "Liqui Moly Starligue",
    leagueShortName: "Starligue",
    federationShortName: "LNH",
    ratingSource: "LNH_OFFICIAL",
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
    appName: "Ligue Butagaz Fantasy",
    leagueName: "Ligue Butagaz Énergie",
    leagueShortName: "Ligue Butagaz",
    federationShortName: "LFH",
    ratingSource: "COMPUTED",
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
