// Plan d'une saison Ligue Butagaz Énergie à partir du calendrier LFH —
// ARCHITECTURE.md §35.4 (lot 2). Fonctions PURES (aucun import Prisma) : tout ce
// qui décide QUOI écrire (clubs, journées, deadlines, dates encore inconnues,
// rapprochement joueuse ↔ ligne de feuille de match) est ici et testé ; l'écriture
// en base est dans src/lib/ingestion/lfh.ts.

import type { LfhTeamRef, ScrapedLfhFixture } from "@/lib/data-providers/lfh.provider";
import type { Position } from "@prisma/client";

const HOUR = 60 * 60 * 1000;

// Nom complet et nom affiché de chaque club (équivalents de Club.name /
// Club.displayName côté Starligue), indexés par le slug de la fiche club WordPress
// LFH — stable d'une saison à l'autre, contrairement à l'id d'équipe LFH (propre à
// chaque poule). Nom complet = libellé officiel de /wp-json/lfh/clubs : le
// calendrier ne donne que des MAJUSCULES (« BREST BRETAGNE HANDBALL »).
export const LFH_CLUB_NAMES: Record<string, { name: string; displayName: string }> = {
  "entente-sportive-besancon-feminin": { name: "Entente Sportive Besançon Féminin", displayName: "Besançon" },
  "brest-bretagne-handball": { name: "Brest Bretagne Handball", displayName: "Brest" },
  chambray: { name: "Chambray Touraine Handball", displayName: "Chambray" },
  jdadijonhand: { name: "JDA Bourgogne Dijon Handball", displayName: "Dijon" },
  "metz-handball": { name: "Metz Handball", displayName: "Metz" },
  "ogc-nice-cote-dazur-handball": { name: "OGC Nice Côte d’Azur Handball", displayName: "Nice" },
  "issy-paris-hand": { name: "Paris 92", displayName: "Paris 92" },
  "handball-plan-de-cuques": { name: "Handball Plan-de-Cuques", displayName: "Plan-de-Cuques" },
  "hbc-st-amand-les-eaux-porte-du-hainaut": { name: "St-Amand Handball - Porte du Hainaut", displayName: "St-Amand" },
  "stella-st-maur-handball": { name: "Stella St-Maur Handball", displayName: "Stella St-Maur" },
  "achenheim-truchtersheim": { name: "Strasbourg Achenheim Truchtersheim Handball", displayName: "Strasbourg" },
  "toulon-metropole-var-handball": { name: "Toulon Métropole Var Handball", displayName: "Toulon" },
};

/** Slug de la fiche club WordPress (« …/clubs/metz-handball/ » → « metz-handball »). */
export function lfhClubSlug(clubPageUrl: string | null): string | null {
  const m = clubPageUrl?.match(/\/clubs\/([^/]+)\/?$/);
  return m ? m[1]! : null;
}

export interface PlannedLfhClub {
  lfhTeamId: string;
  slug: string;
  name: string;
  shortName: string; // clé technique (Club.shortName) : sigle LFH, sinon dérivé du slug
  displayName: string | null;
  logoUrl: string | null;
}

export interface PlannedLfhMatch {
  rencontreId: string;
  extRencontreId: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: Date;
  kickoffTbd: boolean; // date pas encore fixée par la LFH → premier jour de la journée, 20h00
  status: "SCHEDULED" | "FINISHED";
  homeScore: number | null;
  awayScore: number | null;
}

export interface PlannedLfhGameweek {
  number: number;
  deadlineAt: Date; // 1 h avant le premier coup d'envoi (§2.4)
  matches: PlannedLfhMatch[];
}

export interface LfhJourneeDates {
  journee_numero: number;
  date_debut: string; // "2027-03-17"
}

export interface PlannedLfhSeason {
  clubs: PlannedLfhClub[];
  gameweeks: PlannedLfhGameweek[];
}

function planClub(team: LfhTeamRef): PlannedLfhClub {
  const slug = lfhClubSlug(team.clubPageUrl) ?? team.teamId;
  return {
    lfhTeamId: team.teamId,
    slug,
    // Club promu inconnu de la table : nom du calendrier (majuscules) en attendant.
    name: LFH_CLUB_NAMES[slug]?.name ?? team.name,
    shortName: (team.sigle ?? slug.split("-")[0]!).toUpperCase(),
    displayName: LFH_CLUB_NAMES[slug]?.displayName ?? null,
    logoUrl: team.logoUrl,
  };
}

/**
 * Date de repli d'un match sans horaire (fin de saison, pas encore fixée par la
 * LFH) : premier jour de sa journée à 18:00 UTC (20h00 heure d'été / 19h00 heure
 * d'hiver). Marqué kickoffTbd : la synchro du calendrier le remplacera par le vrai
 * horaire dès qu'il est publié (et recalculera la deadline).
 */
function fallbackKickoff(journeeStart: string | undefined): Date | null {
  const m = journeeStart?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, 18, 0)) : null;
}

export function planLfhSeason(fixtures: ScrapedLfhFixture[], journees: LfhJourneeDates[]): PlannedLfhSeason {
  const clubsByTeamId = new Map<string, PlannedLfhClub>();
  for (const f of fixtures) {
    for (const t of [f.home, f.away]) if (!clubsByTeamId.has(t.teamId)) clubsByTeamId.set(t.teamId, planClub(t));
  }
  const shortNames = new Set<string>();
  for (const c of clubsByTeamId.values()) {
    if (shortNames.has(c.shortName)) throw new Error(`LFH : clé club en double « ${c.shortName} »`);
    shortNames.add(c.shortName);
  }

  const startByJournee = new Map(journees.map((j) => [j.journee_numero, j.date_debut]));
  const byNumber = new Map<number, PlannedLfhMatch[]>();
  for (const f of fixtures) {
    const kickoff = f.kickoffAt ?? fallbackKickoff(startByJournee.get(f.gameweekNumber));
    if (!kickoff) throw new Error(`LFH : ni date ni début de journée pour la rencontre ${f.rencontreId} (J${f.gameweekNumber})`);
    const list = byNumber.get(f.gameweekNumber) ?? [];
    list.push({
      rencontreId: f.rencontreId,
      extRencontreId: f.extRencontreId,
      homeTeamId: f.home.teamId,
      awayTeamId: f.away.teamId,
      kickoffAt: kickoff,
      kickoffTbd: f.kickoffAt === null,
      status: f.status,
      homeScore: f.homeScore,
      awayScore: f.awayScore,
    });
    byNumber.set(f.gameweekNumber, list);
  }

  const gameweeks = [...byNumber.entries()]
    .sort(([a], [b]) => a - b)
    .map(([number, matches]) => ({
      number,
      deadlineAt: new Date(Math.min(...matches.map((m) => m.kickoffAt.getTime())) - HOUR),
      matches,
    }));

  return { clubs: [...clubsByTeamId.values()], gameweeks };
}

// ─────────────────── Rapprochement joueuse ↔ feuille de match ───────────────────

export const normalizeLfhName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/gi, "")
    .toUpperCase();

export interface LfhKnownPlayer {
  playerId: string;
  clubId: string;
  firstName: string;
  lastName: string;
  wpPlayerId: number | null;
  individuId: string | null;
}

/**
 * Joueuse en base correspondant à une ligne de feuille de match : id WordPress,
 * puis identifiant fédéral, puis nom + prénom dans le même club (une joueuse
 * dont la fiche WordPress n'est pas liée à la feuille officielle). null si aucun
 * candidat, ou plusieurs homonymes dans le club.
 */
export function resolveLfhPlayer(
  known: LfhKnownPlayer[],
  row: { wpPlayerId: number | null; individuId: string; firstName: string; lastName: string },
  clubId: string
): LfhKnownPlayer | null {
  if (row.wpPlayerId !== null) {
    const byWp = known.find((k) => k.wpPlayerId === row.wpPlayerId);
    if (byWp) return byWp;
  }
  const byIndividu = known.find((k) => k.individuId === row.individuId);
  if (byIndividu) return byIndividu;

  const last = normalizeLfhName(row.lastName);
  const first = normalizeLfhName(row.firstName);
  const sameName = known.filter(
    (k) => k.clubId === clubId && normalizeLfhName(k.lastName) === last && normalizeLfhName(k.firstName) === first
  );
  return sameName.length === 1 ? sameName[0]! : null;
}

// ─────────────────────────── Confirmation ───────────────────────────

const MATCH_DURATION_MS = 2 * HOUR;

/**
 * Une journée LFH notée peut passer au 🟢 quand plus aucun match n'est à jouer et
 * que la fenêtre de correction est écoulée : `delayHours` après la fin estimée
 * (coup d'envoi + 2 h) du DERNIER match. Un match reporté/annulé ne bloque pas.
 */
export function isLfhGameweekReadyToConfirm(
  matches: { kickoffAt: Date; status: string }[],
  now: Date,
  delayHours: number
): boolean {
  if (matches.length === 0 || matches.some((m) => m.status === "SCHEDULED" || m.status === "LIVE")) return false;
  const lastEnd = Math.max(...matches.map((m) => m.kickoffAt.getTime())) + MATCH_DURATION_MS;
  return now.getTime() >= lastEnd + delayHours * HOUR;
}

// ─────────────────────────── Joueuses sans fiche ───────────────────────────

/**
 * Complète une ligne d'effectif sans fiche WordPress avec la saisie manuelle
 * (lfh-roster-overrides.ts). Une ligne qui a déjà un poste n'est jamais touchée.
 */
export function applyLfhRosterOverride<
  T extends { individuId: string; firstName: string; lastName: string; position: Position | null },
>(row: T, overrides: Record<string, { firstName: string; lastName: string; position: Position }>): T {
  if (row.position) return row;
  const o = overrides[row.individuId];
  return o ? { ...row, firstName: o.firstName, lastName: o.lastName, position: o.position } : row;
}
