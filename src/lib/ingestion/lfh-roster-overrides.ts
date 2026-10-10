// Joueuses LBE sans fiche sur ligue-feminine-handball.fr — ARCHITECTURE.md §35.4.1.
//
// Sans fiche WordPress, l'effectif LFH ne donne ni poste ni prénom/nom séparés
// (« NOM PRÉNOM » collés) : la joueuse serait écartée (injouable). Saisie à la main,
// clé = identifiant fédéral (`individuId` de /stats/joueurs), source notée à côté.
// Une fiche WordPress publiée plus tard reprend la main (poste, photo, nom).

import type { Position } from "@prisma/client";

export interface LfhRosterOverride {
  firstName: string;
  lastName: string; // majuscules, comme partout
  position: Position;
}

export const LFH_ROSTER_OVERRIDES: Record<string, LfhRosterOverride> = {
  // Page club LFH Strasbourg Achenheim Truchtersheim, n°31 « Ailière droite – Pro » (10/10/2026).
  "4264962": { firstName: "Anne", lastName: "TOLSTRUP PETERSEN", position: "RW" },
  // Portrait Ligue de Bretagne de handball (2023) : pivot, formée à Rennes puis Dijon.
  "2494332": { firstName: "Anouk", lastName: "CASSIN", position: "PV" },
};
