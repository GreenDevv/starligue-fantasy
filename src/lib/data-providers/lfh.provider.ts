// Provider Ligue Butagaz Énergie (D1 féminine, LFH) — ARCHITECTURE.md §35.2.
//
// Deux sources, recon du 2026-09-29 (l'ancienne api.ligue-feminine-handball.fr
// n'existe plus, cf. mémoire projet `lfh-api-endpoints`) :
//
// 1. API REST du WordPress LFH, publique, sans auth :
//    https://ligue-feminine-handball.fr/wp-json/lfh/v1
//    - /rencontres?poule_id=…      calendrier + résultats (date en UTC)
//    - /stats/joueurs?rencontre_id=…  feuille de match officielle (Gest'Hand) :
//      buts, buts à 7 m, avertissements, 2 min, disqualification — PAS les tirs
//      tentés ni les arrêts (`tirs` = buts dans le jeu, `arrets` toujours 0)
//    - /classements?poule_id=…     classement officiel
//    - /  (racine, paginée par 12) toutes les joueuses LFH+D2F avec poste et photo
//    - /handvision/match/<ext_rencontreId>  → nom du fichier vision-sport du match
//
// 2. Feuille de stats vision-sport (prestataire de la saisie live LFH) :
//    https://www.vision-sport.fr/scores/LIVE<nnn>LFH.html — UNE page par match,
//    numérotée dans l'ordre de la saison et conservée toute la saison (LIVE001-006
//    = J1…). Apporte ce qui manque à la feuille officielle : tirs tentés, temps de
//    jeu, et pour les gardiennes arrêts / tirs subis / 7 m arrêtés et encaissés.
//    HTML ISO-8859-1.
//
// Aucune note de performance publiée : la note est calculée par nous
// (src/lib/scoring/computed-rating.ts) à partir de la fusion des deux sources
// (mergeLfhMatchStats).

import { z } from "zod";
import type { Position } from "@prisma/client";
import { IngestionError, type ScrapedMatchBoxscoreStats } from "./lnh-scraper.provider";
import { decodeEntities } from "@/lib/news/html-to-text";

const SOURCE = "LFH_SCRAPER";
export const LFH_API_BASE_URL = "https://ligue-feminine-handball.fr/wp-json/lfh/v1";
export const VISION_SPORT_BASE_URL = "https://www.vision-sport.fr/scores";
const USER_AGENT = "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)";
const FETCH_TIMEOUT_MS = 15_000;

// Code poste du WordPress LFH → notre enum. Vérifié le 2026-09-29 sur 60 fiches
// joueuses (libellé affiché sur la page de chaque joueuse).
export const LFH_POSITION_MAP: Record<number, Position> = {
  1: "GK",
  2: "LW",
  3: "RW",
  4: "LB",
  5: "CB",
  6: "RB",
  7: "PV",
};

// L'API renvoie tous les nombres en chaînes ("12"), parfois null.
const numStr = z.union([z.string(), z.number(), z.null()]).transform((v) => {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
});

// ───────────────────────────── Calendrier ─────────────────────────────

const lfhTeamSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  libelle: z.string(),
  sigle: z.string().nullable(),
  logo: z.string().nullable().optional(),
  wp_link: z.string().nullable().optional(),
});

const lfhRencontreSchema = z.object({
  id: z.string(),
  ext_rencontreId: z.string(),
  journeeNumero: numStr,
  equipe1Id: z.string(),
  equipe2Id: z.string(),
  equipe1Score: numStr,
  equipe2Score: numStr,
  date: z.string().nullable(),
  equipe1: lfhTeamSchema,
  equipe2: lfhTeamSchema,
});

export interface LfhTeamRef {
  teamId: string; // id d'équipe LFH (propre à la poule/saison)
  name: string;
  sigle: string | null;
  logoUrl: string | null;
  clubPageUrl: string | null; // fiche club WordPress — clé de jointure avec les joueuses
}

export interface ScrapedLfhFixture {
  rencontreId: string; // id interne API LFH (stats/joueurs)
  extRencontreId: string; // id Gest'Hand (handvision, feuille de match officielle)
  gameweekNumber: number;
  kickoffAt: Date | null; // null = date pas encore fixée
  home: LfhTeamRef;
  away: LfhTeamRef;
  homeScore: number | null;
  awayScore: number | null;
  status: "SCHEDULED" | "FINISHED";
}

function toTeamRef(t: z.infer<typeof lfhTeamSchema>): LfhTeamRef {
  return {
    teamId: t.id,
    name: decodeEntities(t.libelle),
    // Sigle parfois vide côté LFH (constaté : Stella St-Maur) → null, le nom suffit.
    sigle: t.sigle?.trim() ? t.sigle.trim() : null,
    logoUrl: t.logo ?? null,
    clubPageUrl: t.wp_link ?? null,
  };
}

/** Date LFH "2026-08-29 15:45:00.000" — UTC (vérifié : +2 h = horaire affiché par vision-sport). */
function parseLfhDateUtc(raw: string | null): Date | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!));
}

export function parseLfhRencontres(json: unknown): ScrapedLfhFixture[] {
  const parsed = z.object({ data: z.array(z.unknown()) }).safeParse(json);
  if (!parsed.success) throw new IngestionError("LFH : réponse /rencontres illisible", SOURCE, true);

  const out: ScrapedLfhFixture[] = [];
  for (const raw of parsed.data.data) {
    const r = lfhRencontreSchema.safeParse(raw);
    if (!r.success || r.data.journeeNumero === null) continue;
    const homeScore = r.data.equipe1Score;
    const awayScore = r.data.equipe2Score;
    const finished = homeScore !== null && awayScore !== null;
    out.push({
      rencontreId: r.data.id,
      extRencontreId: r.data.ext_rencontreId,
      gameweekNumber: r.data.journeeNumero,
      kickoffAt: parseLfhDateUtc(r.data.date),
      home: toTeamRef(r.data.equipe1),
      away: toTeamRef(r.data.equipe2),
      homeScore: finished ? homeScore : null,
      awayScore: finished ? awayScore : null,
      status: finished ? "FINISHED" : "SCHEDULED",
    });
  }
  return out;
}

// ─────────────────────── Feuille de match officielle ───────────────────────

const lfhWpPlayerSchema = z
  .object({
    ID: z.number(),
    thumbnail: z.string().nullable().optional(),
    firstname: z.string().nullable().optional(),
    lastname: z.string().nullable().optional(),
    position: z.union([z.number(), z.string()]).nullable().optional(),
  })
  .nullable()
  .optional();

const lfhStatRowSchema = z.object({
  equipeId: z.string(),
  individuId: z.string(),
  nom: z.string(),
  prenom: z.string().nullable(),
  numero: numStr,
  buts: numStr,
  septMetres: numStr,
  avertissements: numStr,
  deuxMins: numStr,
  disqualifie: numStr,
  wp_player: lfhWpPlayerSchema,
});

export interface LfhOfficialPlayerStat {
  teamId: string;
  individuId: string; // identifiant fédéral de la joueuse (stable d'une saison à l'autre)
  wpPlayerId: number | null;
  lastName: string;
  firstName: string;
  shirtNumber: number | null;
  goals: number;
  penaltyGoals: number;
  warnings: number;
  twoMin: number;
  disqualified: number;
}

export function parseLfhMatchPlayerStats(json: unknown): LfhOfficialPlayerStat[] {
  const parsed = z.object({ data: z.array(z.unknown()) }).safeParse(json);
  if (!parsed.success) throw new IngestionError("LFH : réponse /stats/joueurs illisible", SOURCE, true);

  const out: LfhOfficialPlayerStat[] = [];
  for (const raw of parsed.data.data) {
    const r = lfhStatRowSchema.safeParse(raw);
    if (!r.success) continue;
    const d = r.data;
    out.push({
      teamId: d.equipeId,
      individuId: d.individuId,
      wpPlayerId: d.wp_player?.ID ?? null,
      lastName: decodeEntities(d.nom).trim(),
      firstName: decodeEntities(d.prenom ?? "").trim(),
      shirtNumber: d.numero,
      goals: d.buts ?? 0,
      penaltyGoals: d.septMetres ?? 0,
      warnings: d.avertissements ?? 0,
      twoMin: d.deuxMins ?? 0,
      disqualified: d.disqualifie ?? 0,
    });
  }
  return out;
}

// ─────────────────────────── Classement ───────────────────────────

const lfhStandingSchema = z.object({
  equipeId: z.string(),
  place: numStr,
  point: numStr,
  joue: numStr,
  gagne: numStr,
  nul: numStr,
  perdu: numStr,
  butPlus: numStr,
  butMoins: numStr,
  equipe: lfhTeamSchema,
});

export interface ScrapedLfhStanding {
  team: LfhTeamRef;
  rank: number;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
}

export function parseLfhStandings(json: unknown): ScrapedLfhStanding[] {
  const parsed = z.object({ data: z.array(z.unknown()) }).safeParse(json);
  if (!parsed.success) throw new IngestionError("LFH : réponse /classements illisible", SOURCE, true);
  return parsed.data.data.flatMap((raw) => {
    const r = lfhStandingSchema.safeParse(raw);
    if (!r.success || r.data.place === null) return [];
    const d = r.data;
    return [
      {
        team: toTeamRef(d.equipe),
        rank: d.place!,
        points: d.point ?? 0,
        played: d.joue ?? 0,
        won: d.gagne ?? 0,
        drawn: d.nul ?? 0,
        lost: d.perdu ?? 0,
        goalsFor: d.butPlus ?? 0,
        goalsAgainst: d.butMoins ?? 0,
      },
    ];
  });
}

// ─────────────────────────── Joueuses ───────────────────────────

const lfhPlayerDocSchema = z.object({
  ID: z.number(),
  thumbnail: z.string().nullable(),
  link: z.string(),
  firstname: z.string(),
  lastname: z.string(),
  number: z.string().nullable().optional(),
  player_status: z.string().nullable().optional(),
  position: z.union([z.number(), z.string()]).nullable(),
  // Joueuse sans club : { id: 0, label: "", link: false, logo: false }.
  club: z
    .object({ id: z.number(), label: z.string(), link: z.union([z.string(), z.literal(false)]) })
    .nullable()
    .optional()
    .transform((c) => (c && c.id !== 0 && c.link ? { label: c.label, link: c.link } : null)),
});

export interface ScrapedLfhPlayer {
  wpPlayerId: number;
  firstName: string;
  lastName: string;
  position: Position | null; // null = code poste absent ou inconnu
  shirtNumber: number | null;
  photoUrl: string | null;
  clubName: string | null;
  clubPageUrl: string | null; // jointure avec LfhTeamRef.clubPageUrl
  profileUrl: string;
}

export function parseLfhPlayersPage(json: unknown): { players: ScrapedLfhPlayer[]; totalPages: number } {
  const parsed = z
    .object({ docs: z.array(z.unknown()), totalPages: z.number() })
    .safeParse(json);
  if (!parsed.success) throw new IngestionError("LFH : réponse joueuses illisible", SOURCE, true);

  const players = parsed.data.docs.flatMap((raw): ScrapedLfhPlayer[] => {
    const r = lfhPlayerDocSchema.safeParse(raw);
    if (!r.success) return [];
    const d = r.data;
    const shirt = d.number ? Number(d.number) : NaN;
    return [
      {
        wpPlayerId: d.ID,
        firstName: decodeEntities(d.firstname).trim(),
        lastName: decodeEntities(d.lastname).trim(),
        position: LFH_POSITION_MAP[Number(d.position)] ?? null,
        shirtNumber: Number.isFinite(shirt) ? shirt : null,
        photoUrl: d.thumbnail,
        clubName: d.club ? decodeEntities(d.club.label) : null,
        clubPageUrl: d.club?.link ?? null,
        profileUrl: d.link,
      },
    ];
  });
  return { players, totalPages: parsed.data.totalPages };
}

// ─────────────────────── Feuille vision-sport ───────────────────────

export interface VisionSportPlayerRow {
  side: "home" | "away";
  shirtNumber: number;
  lastName: string;
  firstName: string;
  goals: number;
  shots: number; // tentatives, 7 m comprises
  twoMin: number;
  red: number;
  secondsPlayed: number;
}

export interface VisionSportGoalkeeperRow {
  side: "home" | "away";
  shirtNumber: number;
  lastName: string;
  firstName: string;
  saves: number; // 7 m compris
  shotsFaced: number; // arrêts + buts encaissés, 7 m compris
  penaltySaves: number;
  penaltyGoalsConceded: number;
  secondsPlayed: number;
}

export interface VisionSportSheet {
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  finished: boolean;
  players: VisionSportPlayerRow[];
  goalkeepers: VisionSportGoalkeeperRow[];
}

function cellText(html: string): string {
  // Commentaires "<!---->" autour des nombres dans le tableau gardiennes.
  return decodeEntities(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, ""))
    .replace(/ /g, " ")
    .trim();
}

const cellInt = (s: string | undefined) => {
  const v = parseInt(s ?? "", 10);
  return Number.isFinite(v) ? v : 0;
};

/** "52mn" → 3120, "08sc" → 8, "" → 0. */
export function parseVisionSportTime(raw: string): number {
  const m = raw.trim().match(/^(\d+)\s*(mn|sc)$/i);
  if (!m) return 0;
  return m[2]!.toLowerCase() === "mn" ? Number(m[1]) * 60 : Number(m[1]);
}

function tableRows(tableHtml: string): string[][] {
  return [...tableHtml.matchAll(/<tr class="contenu_tableau">([\s\S]*?)<\/tr>/g)].map((row) =>
    [...row[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => cellText(c[1]!))
  );
}

const PLAYER_HEADERS = ["N°", "J", "Nom", "Prénom", "But", "Tir", "A", "2'", "R", "Tps"];
const GOALKEEPER_HEADERS = ["N°", "Nom", "Prénom", "Arrêt", "Tir", "A7m", "B7m", "Tps"];

/** Un en-tête vide est accepté (constaté : certaines pages n'ont aucun libellé), un en-tête différent non. */
function headersMatch(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((h, i) => h === "" || h === expected[i]);
}

/**
 * Parse une page LIVE<nnn>LFH.html. Structure (vérifiée sur les 24 pages J1-J4
 * 2026/27) : en-tête « équipe A score équipe B », puis pour chaque équipe dans
 * l'ordre domicile → extérieur : un tableau joueuses (N°, J, Nom, Prénom, But,
 * Tir, A, 2', R, Tps) et un tableau « Gardiens » (N°, Nom, Prénom, Arrêt, Tir,
 * A7m, B7m, Tps). Sur certaines pages (LIVE010/015/021) les libellés d'en-tête
 * sont vides : les tableaux sont reconnus par leur nombre de colonnes, et un
 * libellé présent mais différent fait échouer le parse (format changé).
 */
export function parseVisionSportSheet(html: string): VisionSportSheet {
  const teamNames = [...html.matchAll(/<span class="equipe">([\s\S]*?)<\/span>/g)].map((m) => cellText(m[1]!));
  const score = html.match(/<span class="score">\s*(\d+)\s*-\s*(\d+)\s*<\/span>/);
  if (teamNames.length < 2) throw new IngestionError("vision-sport : en-tête d'équipes introuvable", SOURCE, true);

  const dataTables = [...html.matchAll(/<table[^>]*>\s*<tr class="en_tete2">([\s\S]*?)<\/tr>([\s\S]*?)<\/table>/g)].map(
    (m) => ({ headers: [...m[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => cellText(c[1]!)), body: m[2]! })
  );
  const playerTables = dataTables.filter((t) => headersMatch(t.headers, PLAYER_HEADERS)).map((t) => t.body);
  const gkTables = dataTables.filter((t) => headersMatch(t.headers, GOALKEEPER_HEADERS)).map((t) => t.body);
  if (playerTables.length !== 2 || gkTables.length !== 2) {
    throw new IngestionError(
      `vision-sport : ${playerTables.length} tableaux joueuses / ${gkTables.length} tableaux gardiennes (attendu 2/2)`,
      SOURCE,
      true
    );
  }

  const sides = ["home", "away"] as const;
  const players = sides.flatMap((side, i) =>
    tableRows(playerTables[i]!).flatMap((c): VisionSportPlayerRow[] => {
      if (c.length < 10) return [];
      const shirtNumber = parseInt(c[0]!, 10);
      if (!Number.isFinite(shirtNumber)) return [];
      return [
        {
          side,
          shirtNumber,
          lastName: c[2]!,
          firstName: c[3]!,
          goals: cellInt(c[4]),
          shots: cellInt(c[5]),
          twoMin: cellInt(c[7]),
          red: cellInt(c[8]),
          secondsPlayed: parseVisionSportTime(c[9]!),
        },
      ];
    })
  );
  const goalkeepers = sides.flatMap((side, i) =>
    tableRows(gkTables[i]!).flatMap((c): VisionSportGoalkeeperRow[] => {
      if (c.length < 8) return [];
      const shirtNumber = parseInt(c[0]!, 10);
      if (!Number.isFinite(shirtNumber)) return [];
      return [
        {
          side,
          shirtNumber,
          lastName: c[1]!,
          firstName: c[2]!,
          saves: cellInt(c[3]),
          shotsFaced: cellInt(c[4]),
          penaltySaves: cellInt(c[5]),
          penaltyGoalsConceded: cellInt(c[6]),
          secondsPlayed: parseVisionSportTime(c[7]!),
        },
      ];
    })
  );

  return {
    homeTeamName: teamNames[0]!,
    awayTeamName: teamNames[1]!,
    homeScore: score ? Number(score[1]) : null,
    awayScore: score ? Number(score[2]) : null,
    // Le libellé est mal encodé côté vision-sport ("terminÃ©") : on ne lit que le début.
    finished: /Match termin/.test(html),
    players,
    goalkeepers,
  };
}

// ─────────────────────────── Fusion ───────────────────────────

export interface MergedLfhPlayerStat extends ScrapedMatchBoxscoreStats {
  teamId: string;
  individuId: string;
  wpPlayerId: number | null;
  firstName: string;
  lastName: string;
  shirtNumber: number | null;
  isGoalkeeper: boolean; // a une ligne dans le tableau gardiennes vision-sport
  played: boolean;
  secondsPlayed: number | null; // null = feuille vision-sport indisponible
}

const normName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/gi, "")
    .toUpperCase();

/**
 * Fusionne la feuille officielle (identité fédérale, buts, 7 m, sanctions — fait
 * foi) et la feuille vision-sport (tirs tentés, temps de jeu, stats gardiennes).
 * Jointure par côté (domicile/extérieur) + numéro de maillot, confirmée par le
 * nom de famille (un numéro seul pourrait avoir changé en cours de saison).
 * `sheet` null (page vision-sport absente) → stats officielles seules : tirs et
 * arrêts inconnus (null), joué = a marqué ou été sanctionnée — une gardienne ne
 * peut alors pas être notée correctement, d'où le signalement côté ingestion.
 */
export function mergeLfhMatchStats(
  official: LfhOfficialPlayerStat[],
  sheet: VisionSportSheet | null,
  homeTeamId: string
): MergedLfhPlayerStat[] {
  return official.map((o) => {
    const side = o.teamId === homeTeamId ? "home" : "away";
    const sameName = (r: { lastName: string }) => normName(r.lastName) === normName(o.lastName);
    const pick = <T extends { side: string; shirtNumber: number; lastName: string }>(rows: T[]) =>
      rows.find((r) => r.side === side && r.shirtNumber === o.shirtNumber && sameName(r)) ??
      // Numéro différent entre les deux feuilles : repli sur le nom seul dans l'équipe.
      rows.find((r) => r.side === side && sameName(r));

    const vs = sheet ? pick(sheet.players) : undefined;
    const gk = sheet ? pick(sheet.goalkeepers) : undefined;

    const shotsTotal = vs ? Math.max(vs.shots, o.goals) : null;
    const secondsPlayed = sheet ? Math.max(vs?.secondsPlayed ?? 0, gk?.secondsPlayed ?? 0) : null;
    const played =
      secondsPlayed !== null ? secondsPlayed > 0 : o.goals > 0 || o.twoMin > 0 || o.disqualified > 0;

    return {
      teamId: o.teamId,
      individuId: o.individuId,
      wpPlayerId: o.wpPlayerId,
      firstName: o.firstName,
      lastName: o.lastName,
      shirtNumber: o.shirtNumber,
      isGoalkeeper: gk !== undefined,
      played,
      secondsPlayed,
      saves: gk ? gk.saves : null,
      shotsFaced: gk ? gk.shotsFaced : null,
      savePercentage: gk && gk.shotsFaced > 0 ? Math.round((gk.saves / gk.shotsFaced) * 10000) / 100 : null,
      goalsPlay: o.goals - o.penaltyGoals,
      shotsPlay: null, // la répartition jeu/7 m des tentatives n'est publiée nulle part
      goalsPenalty: o.penaltyGoals,
      shotsPenalty: null,
      goalsTotal: o.goals,
      shotsTotal,
      shotPercentage: shotsTotal ? Math.round((o.goals / shotsTotal) * 10000) / 100 : null,
      assists: null,
      ballsRecovered: null,
      opponentShotsBlocked: null,
      penaltiesDrawn: null,
      twoMinDrawn: null,
      neutralizations: null,
      turnovers: null,
      twoMinTaken: o.twoMin,
      disqualified: o.disqualified,
    };
  });
}

// ─────────────────────────── Réseau ───────────────────────────

async function fetchOrThrow(url: string, accept: string): Promise<Response> {
  let res: Response;
  try {
    res = await globalThis.fetch(url, {
      headers: { Accept: accept, "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    throw new IngestionError(`LFH : requête impossible sur ${url} (${String(err)})`, SOURCE, true);
  }
  if (!res.ok) throw new IngestionError(`LFH : HTTP ${res.status} sur ${url}`, SOURCE, true);
  return res;
}

export class LfhProvider {
  readonly name = SOURCE;

  constructor(private readonly apiBaseUrl: string = LFH_API_BASE_URL) {}

  private async getJson(path: string): Promise<unknown> {
    return (await fetchOrThrow(`${this.apiBaseUrl}${path}`, "application/json")).json();
  }

  async fetchSeasonFixtures(pouleId: string): Promise<ScrapedLfhFixture[]> {
    const all: ScrapedLfhFixture[] = [];
    // per_page plafonné à 100 côté API : 132 matchs par saison → 2 pages.
    for (let page = 1; page <= 10; page++) {
      const batch = parseLfhRencontres(await this.getJson(`/rencontres?poule_id=${pouleId}&per_page=100&page=${page}`));
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return all;
  }

  async fetchMatchOfficialStats(rencontreId: string): Promise<LfhOfficialPlayerStat[]> {
    return parseLfhMatchPlayerStats(await this.getJson(`/stats/joueurs?rencontre_id=${rencontreId}&limit=100`));
  }

  async fetchStandings(pouleId: string): Promise<ScrapedLfhStanding[]> {
    return parseLfhStandings(await this.getJson(`/classements?poule_id=${pouleId}`));
  }

  /** Toutes les joueuses publiées (LFH + D2F mélangées, ~57 pages de 12) — à filtrer par club. */
  async fetchAllPlayers(): Promise<ScrapedLfhPlayer[]> {
    const first = parseLfhPlayersPage(await this.getJson(`?page=1`));
    const all = [...first.players];
    for (let page = 2; page <= Math.min(first.totalPages, 200); page++) {
      all.push(...parseLfhPlayersPage(await this.getJson(`?page=${page}`)).players);
    }
    return all;
  }

  /** Nom du fichier vision-sport d'un match ("LIVE001LFH"), null si handvision ne le connaît pas. */
  async fetchVisionSportFilename(extRencontreId: string): Promise<string | null> {
    let json: unknown;
    try {
      json = await this.getJson(`/handvision/match/${extRencontreId}`);
    } catch (err) {
      if (err instanceof IngestionError && /HTTP 404/.test(err.message)) return null;
      throw err;
    }
    const parsed = z
      .object({ data: z.object({ match: z.object({ filename: z.string().nullable() }) }) })
      .safeParse(json);
    return parsed.success ? parsed.data.data.match.filename : null;
  }

  async fetchVisionSportSheet(filename: string): Promise<VisionSportSheet> {
    if (!/^LIVE\d{3}LFH$/.test(filename)) {
      throw new IngestionError(`vision-sport : nom de fichier inattendu "${filename}"`, SOURCE, false);
    }
    const res = await fetchOrThrow(`${VISION_SPORT_BASE_URL}/${filename}.html`, "text/html");
    const html = new TextDecoder("latin1").decode(await res.arrayBuffer());
    return parseVisionSportSheet(html);
  }
}

export function createLfhProvider(): LfhProvider {
  return new LfhProvider();
}
