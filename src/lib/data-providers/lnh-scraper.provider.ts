// ARCHITECTURE.md §3.2 — LnhScraperProvider
// Source : lnh.fr — noms joueurs, postes, clubs pour la saison en cours
//
// Deux méthodes de récupération des joueurs, combinées dans fetchPlayers() :
//   1. Page stats (/daikin-starligue/stats/joueurs, AJAX /ajaxpost1) — basée sur les
//      stats de matchs joués. Vide tant qu'aucun match de la saison n'a été joué
//      (ex: saison future déjà calendarisée mais pas encore commencée).
//   2. Fallback "effectif club" (/daikin-starligue/equipes/<slug>, HTML statique,
//      pas d'AJAX) — liste l'effectif actuel de chaque club, disponible dès que les
//      rosters sont publiés, avant même le premier match. Utilisée automatiquement
//      quand (1) ne retourne aucun joueur.
//
// Photos joueurs : non disponibles (lnh.fr affiche uniquement des silhouettes)

import { z } from "zod";
import type {
  StarligueDataProvider,
  ExternalTeam,
  ExternalFixture,
  ExternalPlayerStat,
} from "./types";

export interface ScrapedPlayer {
  firstName: string;
  lastName: string;
  position: string; // code interne: GK, LW, LB, CB, RB, RW, PV
  lnhClubSlug: string; // ex: "montpellier", "paris", "nantes"
  profileUrl: string; // ex: "daikin-starligue/joueurs/valentin-porte"
}

const LNH_BASE = "https://www.lnh.fr";
const STATS_URL = `${LNH_BASE}/daikin-starligue/stats/joueurs`;
const CALENDAR_URL = `${LNH_BASE}/daikin-starligue/calendrier`;
// Calendrier "global" (toutes compétitions confondues, pas juste Daikin StarLigue) —
// univers="matchs-6892" au lieu de "d1-26623". C'est là, et nulle part ailleurs sur
// lnh.fr, qu'apparaît la compétition "Warm Up -" (matchs de préparation officiellement
// labellisés ainsi par la LNH elle-même, cf. fetchWarmupMatches ci-dessous) —
// découvert le 2026-07-31, à côté de "Trophée des Champions - TDC/WUP" et "Coupe de
// France -". Même structure HTML par item (calendars-listing-item) que CALENDAR_URL.
const WARMUP_CALENDAR_URL = `${LNH_BASE}/matchs/calendrier`;
const WARMUP_UNIVERS = "matchs-6892";
const STANDINGS_URL = `${LNH_BASE}/daikin-starligue/classement`;
const AJAX_URL = `${LNH_BASE}/ajaxpost1`;
const CLUBS_URL = `${LNH_BASE}/daikin-starligue/clubs`;

// lnh.fr écrit certains mois en toutes lettres (avril, mai, juin, mars, juillet) et
// d'autres abrégés avec un point (déc., févr., nov., oct., sept.) — les deux formes
// sont couvertes ici (le point final est de toute façon retiré avant la recherche).
const MONTH_MAP: Record<string, number> = {
  "janv": 1, "jan": 1, "janvier": 1,
  "févr": 2, "fev": 2, "février": 2, "fevrier": 2,
  "mars": 3,
  "avr": 4, "avril": 4,
  "mai": 5,
  "juin": 6,
  "juil": 7, "juillet": 7,
  "août": 8, "aout": 8,
  "sept": 9, "septembre": 9,
  "oct": 10, "octobre": 10,
  "nov": 11, "novembre": 11,
  "déc": 12, "dec": 12, "décembre": 12, "decembre": 12,
};

// Correspondance positions LNH → codes internes
const POSITION_MAP: Record<string, string> = {
  "gardien": "GK",
  "ailier gauche": "LW",
  "arrière gauche": "LB",
  "demi centre": "CB",
  "arrière droit": "RB",
  "ailier droit": "RW",
  "pivot": "PV",
};

// Positions à itérer (exactement les valeurs data-value du select LNH)
const LNH_POSITIONS = [
  "Gardien",
  "Ailier Gauche",
  "Arrière Gauche",
  "Demi Centre",
  "Arrière Droit",
  "Ailier Droit",
  "Pivot",
] as const;

export interface ScrapedSeasonScore {
  firstName: string;
  lastName: string;
  lnhClubSlug: string;
  matchesPlayed: number;
  totalScore: number; // cumul saison du "Score LNH" — moyenne = totalScore / matchesPlayed
}

export interface ScrapedFixture {
  gameweekNumber: number;
  calendarsId: string; // = l'id de l'item calendrier, EST le calendars_id du boxscore (pas besoin d'un fetch séparé)
  homeClubSlug: string;
  awayClubSlug: string;
  kickoffAt: Date;
  status: "SCHEDULED" | "FINISHED";
  homeScore: number | null;
  awayScore: number | null;
}

// Match hors championnat ("Warm Up -"/"Trophée des Champions - WUP", ou
// "Coupe de France -", voir WARMUP_CALENDAR_URL) — contrairement à ScrapedFixture,
// pas de gameweekNumber (ces matchs sont hors championnat) et les deux clubs ne sont
// pas forcément des clubs Daikin StarLigue connus de notre DB (ex: club de D2, ou
// club étranger comme Rhein-Neckar Löwen) — d'où homeClubName/awayClubName toujours
// renseignés en plus des slugs, pour affichage même quand la résolution club échoue
// côté ingestion. Le nom "Warmup" est resté historique (première compétition
// couverte) mais le type sert aussi à la Coupe de France depuis son ajout.
// homeClubLogoUrl/awayClubLogoUrl : URL lnh.fr complète du logo (permet de le
// télécharger localement pour un club hors DB — voir scripts/backfill-warmup-logos.ts).
// homeClubDivision/awayClubDivision : déduit du 1er segment de l'URL équipe lnh.fr
// ("proligue/equipes/…" → "proligue", "daikin-starligue/equipes/…" → "daikin-starligue",
// une URL sans segment, ex: "equipes/rhein-neckar-lowen" → null, club étranger) —
// utile seulement pour un club NON résolu dans notre DB (pour un club Starligue connu,
// notre propre table Club fait autorité, pas ce label lnh.fr).
export interface ScrapedWarmupMatch {
  calendarsId: string;
  competitionLabel: string; // "Warm Up" | "Trophée des Champions - WUP" | "Coupe de France"
  homeClubSlug: string;
  homeClubName: string;
  homeClubLogoUrl: string;
  homeClubDivision: string | null;
  awayClubSlug: string;
  awayClubName: string;
  awayClubLogoUrl: string;
  awayClubDivision: string | null;
  kickoffAt: Date;
  status: "SCHEDULED" | "FINISHED";
  homeScore: number | null;
  awayScore: number | null;
  // Groupe de phase de groupes EHF ("A".."F") — toujours null pour Warm Up/Coupe
  // de France (lnh.fr n'a pas cette notion), voir src/lib/data-providers/
  // ehf-scraper.provider.ts::mapEhfMatch.
  groupLabel: string | null;
}

// Stats détaillées d'un joueur pour un match précis — tableau joueurs de champ
// (les colonnes "buts *"/"tirs adverses contrés"/"penaltys provoqués"/
// "neutralisations" n'existent pas dans le tableau gardiens, qui a "arrêts *"/
// "buts"/"% réussite" à la place) : null si la colonne n'existe pas dans la table
// où la ligne a été trouvée. saves/shotsFaced/savePercentage sont l'inverse : ils
// ne sont renseignés que pour une ligne trouvée dans le tableau gardiens (repéré
// par la colonne "total arrêts", absente du tableau joueurs de champ) — le
// tableau gardiens a AUSSI une colonne "% tirs" mais elle y désigne le % d'arrêts,
// pas le % de réussite au tir : c'est pourquoi shotPercentage/savePercentage sont
// mutuellement exclusifs plutôt que la même colonne physique réutilisée telle quelle.
export interface ScrapedMatchBoxscoreStats {
  saves: number | null;
  shotsFaced: number | null;
  savePercentage: number | null;
  goalsPlay: number | null;
  shotsPlay: number | null;
  goalsPenalty: number | null;
  shotsPenalty: number | null;
  goalsTotal: number | null;
  shotsTotal: number | null;
  shotPercentage: number | null;
  assists: number | null;
  ballsRecovered: number | null;
  opponentShotsBlocked: number | null;
  penaltiesDrawn: number | null;
  twoMinDrawn: number | null;
  neutralizations: number | null;
  turnovers: number | null;
  twoMinTaken: number | null;
  disqualified: number | null;
}

export interface ScrapedMatchBoxscoreRow extends ScrapedMatchBoxscoreStats {
  firstName: string;
  lastName: string;
  lnhClubSlug: string; // domicile ou extérieur, déduit de l'en-tête d'équipe le plus proche
  score: number; // "Score LNH" de CE match précis (≈ PlayerMatchStat.lnhRating)
  played: boolean; // true si temps de jeu > 0
}

// Champs PlayerMatchStat dérivés d'une ligne scrapée — factorisé pour rester en
// synchro entre les deux pipelines d'ingestion (src/lib/simulation/advance.ts pour
// le Mode Simulation, src/lib/ingestion/boxscore.ts pour la saison en direct).
export function boxscoreRowToStatFields(row: ScrapedMatchBoxscoreRow) {
  return {
    lnhRating: row.score,
    played: row.played,
    saves: row.saves,
    shotsFaced: row.shotsFaced,
    savePercentage: row.savePercentage,
    goalsPlay: row.goalsPlay,
    shotsPlay: row.shotsPlay,
    goalsPenalty: row.goalsPenalty,
    shotsPenalty: row.shotsPenalty,
    goalsTotal: row.goalsTotal,
    shotsTotal: row.shotsTotal,
    shotPercentage: row.shotPercentage,
    assists: row.assists,
    ballsRecovered: row.ballsRecovered,
    opponentShotsBlocked: row.opponentShotsBlocked,
    penaltiesDrawn: row.penaltiesDrawn,
    twoMinDrawn: row.twoMinDrawn,
    neutralizations: row.neutralizations,
    turnovers: row.turnovers,
    twoMinTaken: row.twoMinTaken,
    disqualified: row.disqualified,
    source: "LNH_SCRAPER" as const,
  };
}

export class IngestionError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly recoverable: boolean = true
  ) {
    super(message);
    this.name = "IngestionError";
  }
}

function mapPosition(lnhPosition: string): string {
  const key = lnhPosition.toLowerCase().trim();
  return POSITION_MAP[key] ?? "CB";
}

// Extrait LASTNAME Firstname → { firstName, lastName }
function parseName(raw: string): { firstName: string; lastName: string } {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  // Last name = séquence de mots tout en majuscules au début
  const m = cleaned.match(/^([A-ZÁÀÂÆÇÈÉÊËÎÏÔÙÛÜŸ][A-ZÁÀÂÆÇÈÉÊËÎÏÔÙÛÜŸ\-]+(?:\s+[A-ZÁÀÂÆÇÈÉÊËÎÏÔÙÛÜŸ\-]+)*)\s+(.+)$/);
  if (m) return { lastName: (m[1] ?? "").trim(), firstName: (m[2] ?? "").trim() };
  // Fallback : dernier mot = prénom, reste = nom
  const parts = cleaned.split(" ");
  if (parts.length >= 2) {
    return { lastName: parts.slice(0, -1).join(" "), firstName: parts[parts.length - 1]! };
  }
  return { lastName: cleaned, firstName: "" };
}

// Extrait le slug club depuis une URL logo : "montpellier__logo__2024-2025.png" → "montpellier"
function extractClubSlug(logoUrl: string): string {
  const m = logoUrl.match(/sports_teams\/([^_]+)__logo__/);
  return m?.[1] ?? "unknown";
}

// Parse les lignes joueurs depuis le HTML retourné par ajaxpost1
function parsePlayersFromHtml(html: string, position: string): ScrapedPlayer[] {
  const players: ScrapedPlayer[] = [];
  // Chaque ligne joueur a un <a href="daikin-starligue/joueurs/...">NOM Prenom</a>
  // et un <img src="https://www.lnh.fr/medias/sports_teams/club__logo__...">
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1]!;
    const nameMatch = row.match(/href=['"]daikin-starligue\/joueurs\/([^'"]+)['"]\s*>\s*([^\n<]{3,}?)\s*<\/a>/);
    const logoMatch = row.match(/<img src="(https:\/\/[^"]*sports_teams[^"]*)"[^>]*\/?>/);
    if (!nameMatch || !logoMatch) continue;

    const profileSlug = nameMatch[1]!;
    const rawName = nameMatch[2]!.trim();
    if (!rawName || rawName.length < 2) continue;

    const { firstName, lastName } = parseName(rawName);
    if (!firstName || !lastName) continue;

    const lnhClubSlug = extractClubSlug(logoMatch[1]!);
    players.push({
      firstName,
      lastName,
      position: mapPosition(position),
      lnhClubSlug,
      profileUrl: `daikin-starligue/joueurs/${profileSlug}`,
    });
  }

  return players;
}

// Parse le classement "Score LNH" (daikin-starligue/stats/joueurs, orderby=note_lnh)
// — les colonnes varient selon le poste filtré, donc on repère "mj" et "Score LNH"
// par leur libellé d'en-tête plutôt que par un index fixe.
function parseSeasonScoresFromHtml(html: string): ScrapedSeasonScore[] {
  const results: ScrapedSeasonScore[] = [];

  const theadMatch = html.match(/<thead>([\s\S]*?)<\/thead>/);
  if (!theadMatch) return results;

  const headerLabels: string[] = [];
  const headRe = /<div class="thead-inside"[^>]*>([\s\S]*?)<\/div>/g;
  let hm: RegExpExecArray | null;
  while ((hm = headRe.exec(theadMatch[1]!)) !== null) {
    headerLabels.push(
      hm[1]!.replace(/<br\s*\/?>/g, " ").replace(/\s+/g, " ").trim().toLowerCase()
    );
  }
  const mjIdx = headerLabels.findIndex((h) => h === "mj");
  const scoreIdx = headerLabels.findIndex((h) => h.includes("score") && h.includes("lnh"));
  if (mjIdx === -1 || scoreIdx === -1) return results;

  const rowRegex = /<tr class="">([\s\S]*?)<\/tr>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1]!;
    const nameMatch = row.match(/<div class="name">\s*<a[^>]*>\s*([^<]+?)\s*<\/a>/);
    const logoMatch = row.match(/<img src="(https:\/\/[^"]*sports_teams[^"]*)"/);
    if (!nameMatch || !logoMatch) continue;

    const tds: string[] = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRegex.exec(row)) !== null) {
      tds.push(tdMatch[1]!.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
    }

    const matchesPlayed = parseInt(tds[mjIdx] ?? "", 10);
    const totalScore = parseFloat((tds[scoreIdx] ?? "").replace(",", "."));
    if (!matchesPlayed || Number.isNaN(totalScore)) continue; // pas de score exploitable

    const { firstName, lastName } = parseName(nameMatch[1]!.trim());
    if (!firstName || !lastName) continue;

    results.push({
      firstName,
      lastName,
      lnhClubSlug: extractClubSlug(logoMatch[1]!),
      matchesPlayed,
      totalScore,
    });
  }

  return results;
}

function cellAt(tds: string[], idx: number): string | undefined {
  return idx === -1 ? undefined : tds[idx];
}

function cellInt(tds: string[], idx: number): number | null {
  const raw = cellAt(tds, idx);
  if (raw === undefined || raw === "") return null;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

// "1 / 1" (buts tirs/penalty/total, made/attempted) — le "total buts" du HTML source
// est enveloppé dans <span class="top-stats">, déjà retiré par le nettoyage tdRegex
// (strip de toutes les balises internes) donc le texte de cellule est déjà propre ici.
function parseFraction(raw: string | undefined): { made: number | null; attempted: number | null } {
  const m = raw?.match(/(-?\d+)\s*\/\s*(-?\d+)/);
  if (!m) return { made: null, attempted: null };
  return { made: parseInt(m[1]!, 10), attempted: parseInt(m[2]!, 10) };
}

// "100,00 %" → 100
function parsePercent(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = parseFloat(raw.replace(",", ".").replace("%", "").trim());
  return Number.isNaN(n) ? null : n;
}

// "OUI"/"NON" → 1/0 (stocké en Int, pas Boolean — cf. PlayerMatchStat.disqualified)
function parseYesNo(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const v = raw.trim().toUpperCase();
  if (v === "OUI") return 1;
  if (v === "NON") return 0;
  return null;
}

// Parse la fiche d'un match (daikin-starligue/calendriers/.../jNN/home/away, onglet
// "view_tab_stats") : plusieurs tables (gardiens/joueurs de champ × domicile/extérieur),
// chacune précédée d'un bloc `team-header` avec le logo du club concerné. On associe
// chaque ligne joueur au club de l'en-tête `team-header` la plus proche en amont dans
// le HTML plutôt qu'un index de table fixe (le nombre de tables varie).
export function parseMatchBoxscoreHtml(html: string): ScrapedMatchBoxscoreRow[] {
  const results: ScrapedMatchBoxscoreRow[] = [];

  interface Segment { start: number; clubSlug: string }
  const segments: Segment[] = [];
  // class="team-header" ou class="team-header away" selon domicile/extérieur
  const teamHeaderRegex = /class="team-header[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g;
  let thMatch: RegExpExecArray | null;
  while ((thMatch = teamHeaderRegex.exec(html)) !== null) {
    const logoMatch = thMatch[1]!.match(/<img src="(https:\/\/[^"]*sports_teams[^"]*)"/);
    if (!logoMatch) continue;
    segments.push({ start: thMatch.index, clubSlug: extractClubSlug(logoMatch[1]!) });
  }
  if (segments.length === 0) return results;

  for (let i = 0; i < segments.length; i++) {
    const segStart = segments[i]!.start;
    const segEnd = i + 1 < segments.length ? segments[i + 1]!.start : html.length;
    const segment = html.slice(segStart, segEnd);
    const clubSlug = segments[i]!.clubSlug;

    // Une ou plusieurs tables dans ce segment (gardiens + joueurs de champ)
    const tableRegex = /<table class="table-stats">([\s\S]*?)<\/table>/g;
    let tableMatch: RegExpExecArray | null;
    while ((tableMatch = tableRegex.exec(segment)) !== null) {
      const table = tableMatch[1]!;
      const theadMatch = table.match(/<thead>([\s\S]*?)<\/thead>/);
      if (!theadMatch) continue;

      const headerLabels: string[] = [];
      const headRe = /<div class="thead-inside"[^>]*>([\s\S]*?)<\/div>/g;
      let hm: RegExpExecArray | null;
      while ((hm = headRe.exec(theadMatch[1]!)) !== null) {
        headerLabels.push(
          hm[1]!
            .replace(/<br\s*\/?>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase()
            .replace(/\s*\*\s*$/, "") // "ballons récupérés *" → "ballons récupérés"
        );
      }
      const scoreIdx = headerLabels.findIndex((h) => h.includes("score") && h.includes("lnh"));
      const timeIdx = headerLabels.findIndex((h) => h.includes("temps") && h.includes("jeu"));
      if (scoreIdx === -1) continue;

      // Colonnes de stats détaillées — indexOf exact (pas includes) pour éviter les
      // collisions type "2 min" vs "2 min provoquées". -1 si absente de cette table
      // (ex: tableau gardiens n'a pas "buts tirs"/"tirs adverses contrés"/etc.) → le
      // champ correspondant restera null pour toutes les lignes de cette table.
      const statIdx = {
        saves: headerLabels.indexOf("total arrêts"), // présence = signature du tableau gardiens
        goalsPlay: headerLabels.indexOf("buts tirs"),
        goalsPenalty: headerLabels.indexOf("buts penalty"),
        goalsTotal: headerLabels.indexOf("total buts"),
        // "% tirs" existe dans les deux tableaux mais désigne le % d'arrêts chez les
        // gardiens (voir isGoalkeeperTable ci-dessous) — même colonne physique,
        // routée vers savePercentage ou shotPercentage selon le tableau.
        shotPercentage: headerLabels.indexOf("% tirs"),
        assists: headerLabels.indexOf("dernière passe"),
        ballsRecovered: headerLabels.indexOf("ballons récupérés"),
        opponentShotsBlocked: headerLabels.indexOf("tirs adverses contrés"),
        penaltiesDrawn: headerLabels.indexOf("penaltys provoqués"),
        twoMinDrawn: headerLabels.indexOf("2 min provoquées"),
        neutralizations: headerLabels.indexOf("neutralisations"),
        turnovers: headerLabels.indexOf("pertes balles"),
        twoMinTaken: headerLabels.indexOf("2 min"),
        disqualified: headerLabels.indexOf("disq."),
      };
      const isGoalkeeperTable = statIdx.saves !== -1;

      const rowRegex = /<tr class="">([\s\S]*?)<\/tr>/g;
      let rowMatch: RegExpExecArray | null;
      while ((rowMatch = rowRegex.exec(table)) !== null) {
        const row = rowMatch[1]!;
        const nameMatch = row.match(/<div class="name">\s*<a[^>]*>\s*([^<]+?)\s*<\/a>/);
        if (!nameMatch) continue;

        const tds: string[] = [];
        const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
        let tdMatch: RegExpExecArray | null;
        while ((tdMatch = tdRegex.exec(row)) !== null) {
          tds.push(tdMatch[1]!.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
        }

        const score = parseFloat((tds[scoreIdx] ?? "").replace(",", "."));
        if (Number.isNaN(score)) continue;

        const playedTime = timeIdx !== -1 ? (tds[timeIdx] ?? "") : "";
        const played = /^(?!00:00$).+/.test(playedTime.trim()) && playedTime.trim() !== "";

        const { firstName, lastName } = parseName(nameMatch[1]!.trim());
        if (!firstName || !lastName) continue;

        const goalsPlayFrac = parseFraction(cellAt(tds, statIdx.goalsPlay));
        const goalsPenaltyFrac = parseFraction(cellAt(tds, statIdx.goalsPenalty));
        const goalsTotalFrac = parseFraction(cellAt(tds, statIdx.goalsTotal));
        // "total arrêts" = "13 / 41" = arrêts / tirs subis (arrêts + buts encaissés),
        // cf. commentaire lnh.fr "(2) Tirs = arrêts + buts" sur la page boxscore.
        const savesFrac = parseFraction(cellAt(tds, statIdx.saves));
        const shotPercentageValue = parsePercent(cellAt(tds, statIdx.shotPercentage));

        results.push({
          firstName,
          lastName,
          lnhClubSlug: clubSlug,
          score,
          played,
          saves: savesFrac.made,
          shotsFaced: savesFrac.attempted,
          savePercentage: isGoalkeeperTable ? shotPercentageValue : null,
          goalsPlay: goalsPlayFrac.made,
          shotsPlay: goalsPlayFrac.attempted,
          goalsPenalty: goalsPenaltyFrac.made,
          shotsPenalty: goalsPenaltyFrac.attempted,
          goalsTotal: goalsTotalFrac.made,
          shotsTotal: goalsTotalFrac.attempted,
          shotPercentage: isGoalkeeperTable ? null : shotPercentageValue,
          assists: cellInt(tds, statIdx.assists),
          ballsRecovered: cellInt(tds, statIdx.ballsRecovered),
          opponentShotsBlocked: cellInt(tds, statIdx.opponentShotsBlocked),
          penaltiesDrawn: cellInt(tds, statIdx.penaltiesDrawn),
          twoMinDrawn: cellInt(tds, statIdx.twoMinDrawn),
          neutralizations: cellInt(tds, statIdx.neutralizations),
          turnovers: cellInt(tds, statIdx.turnovers),
          twoMinTaken: cellInt(tds, statIdx.twoMinTaken),
          disqualified: parseYesNo(cellAt(tds, statIdx.disqualified)),
        });
      }
    }
  }

  return results;
}

// Infère l'année d'une date de calendrier sans année ("ven. 05 sept." / "sam. 06 juin") :
// août→décembre = 1ère année de la saison, janvier→juillet = 2ème année.
// seasonStartYear = ex 2025 pour la saison "2025-2026".
function inferYear(month: number, seasonStartYear: number): number {
  return month >= 8 ? seasonStartYear : seasonStartYear + 1;
}

// Construit une date UTC à partir d'une heure locale française, sans dépendre du
// fuseau horaire de la machine qui exécute le code (Date(y,m,d,h,min) utiliserait le
// fuseau système, imprévisible en prod). Approximation DST (CEST fin mars→fin oct,
// CET le reste) suffisante ici — l'heure exacte n'affecte aucun calcul de points,
// seulement l'affichage/tri chronologique.
function franceLocalToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const isSummer = month >= 4 && month <= 10; // CEST (UTC+2) approx. avril-octobre, sinon CET (UTC+1)
  const offsetHours = isSummer ? 2 : 1;
  return new Date(Date.UTC(year, month - 1, day, hour - offsetHours, minute));
}

// Parse le calendrier complet d'une saison (daikin-starligue/calendrier, action
// index_ajax) — chaque `calendars-listing-item` porte un attribut `id` qui EST le
// `calendars_id` utilisé par fetchMatchBoxscore (vérifié : id="11234" sur le bloc
// Montpellier-Nîmes J30 correspond exactement au calendars_id résolu séparément) —
// pas besoin d'un fetch par match pour l'obtenir.
export function parseCalendarFromHtml(html: string, seasonStartYear: number): ScrapedFixture[] {
  const results: ScrapedFixture[] = [];

  const items = html.split('<div class="calendars-listing-item').slice(1);
  for (const raw of items) {
    const idMatch = raw.match(/^[^>]*\bid="(\d+)"/s);
    const gwMatch = raw.match(/Daikin StarLigue - J(\d+)/);
    const dateMatch = raw.match(/(\d{1,2})\s+([a-zéû.]+)\.?\s+(\d{1,2})h(\d{2})/i);
    if (!idMatch || !gwMatch || !dateMatch) continue;

    const monthKey = dateMatch[2]!.toLowerCase().replace(/\.$/, "");
    const month = MONTH_MAP[monthKey];
    if (!month) continue;
    const day = parseInt(dateMatch[1]!, 10);
    const hour = parseInt(dateMatch[3]!, 10);
    const minute = parseInt(dateMatch[4]!, 10);
    const year = inferYear(month, seasonStartYear);
    const kickoffAt = franceLocalToUtc(year, month, day, hour, minute);

    const logoMatches = [...raw.matchAll(/sports_teams\/([^_"]+)__logo__/g)];
    if (logoMatches.length < 2) continue;
    const homeClubSlug = logoMatches[0]![1]!;
    const awayClubSlug = logoMatches[1]![1]!;

    const scoreMatch = raw.match(/class="scores is-finish">\s*(\d+)\s*-\s*(\d+)\s*</);

    results.push({
      gameweekNumber: parseInt(gwMatch[1]!, 10),
      calendarsId: idMatch[1]!,
      homeClubSlug,
      awayClubSlug,
      kickoffAt,
      status: scoreMatch ? "FINISHED" : "SCHEDULED",
      homeScore: scoreMatch ? parseInt(scoreMatch[1]!, 10) : null,
      awayScore: scoreMatch ? parseInt(scoreMatch[2]!, 10) : null,
    });
  }

  return results;
}

// Parse le calendrier global lnh.fr (WARMUP_CALENDAR_URL) — même structure de bloc
// que parseCalendarFromHtml (calendars-listing-item), mais sans gameweekNumber (hors
// championnat) et avec les noms de club en clair (team-name) en plus des slugs, les
// deux clubs n'étant pas garantis d'être des clubs Daikin StarLigue connus de notre
// DB (club de D2/Proligue, ou club étranger). Générique sur un ensemble de libellés
// de compétition autorisés — partagé par parseWarmupFromHtml (exclut notamment
// "Trophée des Champions - TDC", le match d'ouverture officiel, pas un amical) et
// parseCoupeDeFranceFromHtml, seule la logique de filtre diffère.
// Les noms de club affichés en clair (team-name) peuvent contenir des entités HTML
// (ex: "Elite Val d&apos;Oise") — jamais rencontré ailleurs dans ce fichier (les
// autres champs club viennent de attributs alt="logo X", pas de ce bloc-là), donc pas
// de décodeur existant à réutiliser. Table minimale, mêmes conventions que les
// providers d'actus (src/lib/data-providers/news/*).
const WARMUP_NAMED_ENTITIES: Record<string, string> = {
  apos: "'",
  amp: "&",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
};

function decodeWarmupEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&([a-z]+);/gi, (full: string, name: string) => WARMUP_NAMED_ENTITIES[name.toLowerCase()] ?? full);
}

interface WarmupTeamInfo {
  slug: string;
  name: string;
  logoUrl: string;
  division: string | null;
}

// Un bloc "team-logo" complet (href + img + team-name) — extraits ensemble pour
// garantir le bon appariement (plutôt que 2 matchAll globaux séparés sur tout
// l'item, qui pourraient désaligner slug/nom si l'un des deux motifs manquait pour
// une équipe seulement).
function extractWarmupTeamInfo(block: string): WarmupTeamInfo | null {
  const logoMatch = block.match(/(https:\/\/www\.lnh\.fr\/medias\/sports_teams\/([^_"]+)__logo__[^"]*\.png)/);
  const nameMatch = block.match(/<div class="team-name">\s*([^<]+?)\s*<\/div>/);
  if (!logoMatch || !nameMatch) return null;

  // "https://www.lnh.fr/proligue/equipes/…" → "proligue" ; "…/daikin-starligue/equipes/…"
  // → "daikin-starligue" ; "https://www.lnh.fr/equipes/…" (pas de segment, club
  // étranger) → null. Fiable seulement pour un club absent de notre DB — voir
  // ScrapedWarmupMatch.
  const hrefMatch = block.match(/<a href="https:\/\/www\.lnh\.fr\/([a-z0-9-]+\/)?equipes\//);
  const division = hrefMatch?.[1] ? hrefMatch[1].replace(/\/$/, "") : null;

  return {
    slug: logoMatch[2]!,
    name: decodeWarmupEntities(nameMatch[1]!),
    logoUrl: logoMatch[1]!,
    division,
  };
}

function parseFriendlyMatchesFromHtml(
  html: string,
  seasonStartYear: number,
  allowedLabels: ReadonlySet<string>
): ScrapedWarmupMatch[] {
  const results: ScrapedWarmupMatch[] = [];

  const items = html.split('<div class="calendars-listing-item').slice(1);
  for (const raw of items) {
    const idMatch = raw.match(/^[^>]*\bid="(\d+)"/s);
    const competitionMatch = raw.match(/<span class="competition">\s*([^<]+?)\s*<\/span>/);
    const dateMatch = raw.match(/(\d{1,2})\s+([a-zéû.]+)\.?\s+(\d{1,2})h(\d{2})/i);
    if (!idMatch || !competitionMatch || !dateMatch) continue;

    const competitionLabel = competitionMatch[1]!.replace(/\s*-\s*$/, "").trim();
    if (!allowedLabels.has(competitionLabel)) continue;

    const monthKey = dateMatch[2]!.toLowerCase().replace(/\.$/, "");
    const month = MONTH_MAP[monthKey];
    if (!month) continue;
    const day = parseInt(dateMatch[1]!, 10);
    const hour = parseInt(dateMatch[3]!, 10);
    const minute = parseInt(dateMatch[4]!, 10);
    const year = inferYear(month, seasonStartYear);
    const kickoffAt = franceLocalToUtc(year, month, day, hour, minute);

    const teamBlocks = raw.split('<div class="team-logo">').slice(1, 3);
    if (teamBlocks.length < 2) continue;
    const home = extractWarmupTeamInfo(teamBlocks[0]!);
    const away = extractWarmupTeamInfo(teamBlocks[1]!);
    if (!home || !away) continue;

    const scoreMatch = raw.match(/class="scores is-finish">\s*(\d+)\s*-\s*(\d+)\s*</);

    results.push({
      calendarsId: idMatch[1]!,
      competitionLabel,
      homeClubSlug: home.slug,
      homeClubName: home.name,
      homeClubLogoUrl: home.logoUrl,
      homeClubDivision: home.division,
      awayClubSlug: away.slug,
      awayClubName: away.name,
      awayClubLogoUrl: away.logoUrl,
      awayClubDivision: away.division,
      kickoffAt,
      status: scoreMatch ? "FINISHED" : "SCHEDULED",
      homeScore: scoreMatch ? parseInt(scoreMatch[1]!, 10) : null,
      awayScore: scoreMatch ? parseInt(scoreMatch[2]!, 10) : null,
      groupLabel: null,
    });
  }

  return results;
}

const WARMUP_LABELS = new Set(["Warm Up", "Trophée des Champions - WUP"]);
const COUPE_DE_FRANCE_LABELS = new Set(["Coupe de France"]);

export function parseWarmupFromHtml(html: string, seasonStartYear: number): ScrapedWarmupMatch[] {
  return parseFriendlyMatchesFromHtml(html, seasonStartYear, WARMUP_LABELS);
}

export function parseCoupeDeFranceFromHtml(html: string, seasonStartYear: number): ScrapedWarmupMatch[] {
  return parseFriendlyMatchesFromHtml(html, seasonStartYear, COUPE_DE_FRANCE_LABELS);
}

// Une ligne du classement officiel (daikin-starligue/classement, contents_controller=
// sportsStandings) — colonnes confirmées par capture réelle le 2026-07-20 :
// pts, mj, vict., nul, déf., buts pour, buts contre, goal avg, part.pts, part.goals
// (les 2 dernières = pénalités disciplinaires, ignorées ici, pas demandées).
export interface ScrapedStanding {
  rank: number;
  clubSlug: string;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalAvg: number;
}

// Parse le tableau de classement retourné par sportsStandings/index_ajax. Une ligne
// = <tr class="">, 1ère cellule "first-cell" (rang + logo), 2ème cellule (nom club,
// ignoré — le slug logo est plus fiable, même convention que les autres parseurs de
// ce fichier), puis 8 cellules numériques dans l'ordre du thead.
export function parseStandingsFromHtml(html: string): ScrapedStanding[] {
  const results: ScrapedStanding[] = [];
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return results;

  const rowRegex = /<tr class="">([\s\S]*?)<\/tr>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(tbodyMatch[1]!)) !== null) {
    const row = rowMatch[1]!;
    const rankMatch = row.match(/class="pos"[^>]*>\s*<span>(\d+)<\/span>/);
    const logoMatch = row.match(/<img src="(https:\/\/[^"]*sports_teams[^"]*)"/);
    if (!rankMatch || !logoMatch) continue;

    const tds: string[] = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRegex.exec(row)) !== null) {
      tds.push(tdMatch[1]!.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
    }
    // tds[0] = 1ère cellule (rang+logo, texte ignoré), tds[1] = cellule nom club (ignorée)
    const points = parseInt(tds[2] ?? "", 10);
    const played = parseInt(tds[3] ?? "", 10);
    const wins = parseInt(tds[4] ?? "", 10);
    const draws = parseInt(tds[5] ?? "", 10);
    const losses = parseInt(tds[6] ?? "", 10);
    const goalsFor = parseInt(tds[7] ?? "", 10);
    const goalsAgainst = parseInt(tds[8] ?? "", 10);
    const goalAvg = parseInt(tds[9] ?? "", 10);
    if ([points, played, wins, draws, losses, goalsFor, goalsAgainst, goalAvg].some(Number.isNaN)) continue;

    results.push({
      rank: parseInt(rankMatch[1]!, 10),
      clubSlug: extractClubSlug(logoMatch[1]!),
      points,
      played,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      goalAvg,
    });
  }

  return results;
}

// Extrait Prenom LASTNAME → { firstName, lastName } (format des pages club,
// inverse de parseName() qui gère le format LASTNAME Prenom de la page stats).
// Le nom de famille = suffixe maximal de tokens entièrement en majuscules.
function parseRosterName(raw: string): { firstName: string; lastName: string } {
  const tokens = raw.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (tokens.length < 2) return { firstName: "", lastName: raw.trim() };

  let splitIdx = tokens.length;
  for (let i = tokens.length - 1; i >= 1; i--) {
    const t = tokens[i]!;
    if (t === t.toUpperCase() && t !== t.toLowerCase()) {
      splitIdx = i;
    } else {
      break;
    }
  }
  return {
    firstName: tokens.slice(0, splitIdx).join(" "),
    lastName: tokens.slice(splitIdx).join(" "),
  };
}

// Parse l'effectif d'un club depuis le HTML statique de sa page
// (section "Effectif", carousel de <a class="players-listing-item">)
function parseRosterFromHtml(html: string): ScrapedPlayer[] {
  const players: ScrapedPlayer[] = [];
  const itemRegex =
    /href="https:\/\/www\.lnh\.fr\/(daikin-starligue\/joueurs\/[a-z0-9-]+)">[\s\S]*?<div class="name">([^<]+)<\/div><div class="description">([^<]+)<\/div>/g;
  const logoMatch = html.match(/<img src="(https:\/\/[^"]*sports_teams[^"]*)"/);
  const lnhClubSlug = logoMatch ? extractClubSlug(logoMatch[1]!) : "unknown";

  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(html)) !== null) {
    const profileUrl = m[1]!;
    const rawName = m[2]!.trim();
    const position = m[3]!.trim();

    const { firstName, lastName } = parseRosterName(rawName);
    if (!firstName || !lastName) continue;

    players.push({
      firstName,
      lastName,
      position: mapPosition(position),
      lnhClubSlug,
      profileUrl,
    });
  }

  return players;
}

export class LnhScraperProvider implements StarligueDataProvider {
  readonly name = "LNH_SCRAPER";

  private async fetchWithTimeout(url: string, init?: RequestInit): Promise<Response | null> {
    try {
      const res = await globalThis.fetch(url, {
        ...init,
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) return res;
      return null;
    } catch {
      return null;
    }
  }

  // Récupère le CSRF key + session cookie + seasons_id courant
  private async getFormContext(): Promise<{ key: string; cookie: string; seasonsId: string } | null> {
    try {
      const res = await globalThis.fetch(STATS_URL, {
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)" },
      });
      if (!res.ok) return null;

      const html = await res.text();
      const keyMatch = html.match(/name="key"\s+value="(\d+)"/);
      const seasonsMatch = html.match(/value="(\d+)"\s+selected/);
      const cookie = res.headers.get("set-cookie") ?? "";

      if (!keyMatch) return null;

      // Récupère seasons_id de la saison courante (première option après "all")
      const currentSeasonMatch = html.match(/value="(\d+)" >/);

      return {
        key: keyMatch[1]!,
        cookie,
        seasonsId: seasonsMatch?.[1] ?? currentSeasonMatch?.[1] ?? "39",
      };
    } catch {
      return null;
    }
  }

  // Récupère tous les joueurs d'une position donnée (avec pagination)
  private async fetchPosition(
    position: string,
    key: string,
    cookie: string,
    seasonsId: string
  ): Promise<ScrapedPlayer[]> {
    const allPlayers: ScrapedPlayer[] = [];
    let page = 1;

    while (true) {
      const body = new URLSearchParams({
        contents_controller: "sportsPlayersStats",
        contents_action: "index_ajax",
        type: "joueurs",
        univers: "d1-26623",
        "pagination-items": "100",
        "pagination-current": String(page),
        multi_teams_id: "all",
        multi_teams_against: "all",
        multi_days_id: "all",
        multi_positions_name: position,
        orderby: "",
        seasons_id: seasonsId,
        key,
      });

      const res = await this.fetchWithTimeout(AJAX_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body.toString(),
      });

      if (!res) break;
      const html = await res.text();
      if (!html || html.trim().length < 50) break;

      const players = parsePlayersFromHtml(html, position);
      if (players.length === 0) break;

      allPlayers.push(...players);

      // Si moins de 100 joueurs retournés, on est à la dernière page
      if (players.length < 100) break;
      page++;
    }

    return allPlayers;
  }

  // Récupère tous les joueurs d'une saison donnée (ou la saison en cours par défaut)
  async fetchPlayers(overrideSeasonsId?: string): Promise<ScrapedPlayer[]> {
    const ctx = await this.getFormContext();
    if (!ctx) {
      throw new IngestionError(
        "LNH Scraper : impossible de récupérer le contexte de formulaire depuis lnh.fr",
        this.name,
        true
      );
    }

    const seasonsId = overrideSeasonsId ?? ctx.seasonsId;
    const allPlayers: ScrapedPlayer[] = [];
    const seen = new Set<string>(); // déduplication par profileUrl

    for (const position of LNH_POSITIONS) {
      const players = await this.fetchPosition(position, ctx.key, ctx.cookie, seasonsId);
      for (const p of players) {
        if (!seen.has(p.profileUrl)) {
          seen.add(p.profileUrl);
          allPlayers.push(p);
        }
      }
    }

    // La page stats est vide tant qu'aucun match de la saison n'a été joué
    // (typiquement une saison future déjà calendarisée) → fallback effectifs club.
    if (allPlayers.length === 0) {
      return this.fetchPlayersFromClubRosters();
    }

    return allPlayers;
  }

  // Récupère le classement "Score LNH" (moyenne = totalScore/matchesPlayed) d'une
  // saison lnh.fr donnée (ex: "39" = 2025/2026). Toutes positions confondues,
  // paginé par 100. Vide si la saison n'a aucun match joué (mêmes limites que
  // fetchPlayers — pas de fallback ici, une saison passée a toujours des scores).
  async fetchSeasonScores(seasonsId: string): Promise<ScrapedSeasonScore[]> {
    const ctx = await this.getFormContext();
    if (!ctx) {
      throw new IngestionError(
        "LNH Scraper : impossible de récupérer le contexte de formulaire depuis lnh.fr",
        this.name,
        true
      );
    }

    const allScores: ScrapedSeasonScore[] = [];
    let page = 1;

    while (true) {
      const body = new URLSearchParams({
        contents_controller: "sportsPlayersStats",
        contents_action: "index_ajax",
        type: "joueurs",
        univers: "d1-26623",
        "pagination-items": "100",
        "pagination-current": String(page),
        multi_teams_id: "all",
        multi_teams_against: "all",
        multi_days_id: "all",
        multi_positions_name: "all",
        orderby: "note_lnh",
        seasons_id: seasonsId,
        key: ctx.key,
      });

      const res = await this.fetchWithTimeout(AJAX_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)",
          ...(ctx.cookie ? { Cookie: ctx.cookie } : {}),
        },
        body: body.toString(),
      });

      if (!res) break;
      const html = await res.text();
      if (!html || html.trim().length < 50) break;

      const scores = parseSeasonScoresFromHtml(html);
      if (scores.length === 0) break;

      allScores.push(...scores);

      if (scores.length < 100) break;
      page++;
    }

    return allScores;
  }

  // Résout l'id interne lnh.fr (`calendars_id`) d'un match depuis sa page de détail,
  // nécessaire pour lire son boxscore (fetchMatchBoxscore). Chaque page match a son
  // propre `key` CSRF, distinct de celui de STATS_URL — capturé ici, pas réutilisable
  // ailleurs. `seasonSlug` ex: "20252026", `homeSlug`/`awaySlug` = slugs d'équipe LNH
  // (extractClubSlug), `gameweekNumber` = numéro de journée (1-30).
  async fetchMatchCalendarsId(
    seasonSlug: string,
    gameweekNumber: number,
    homeSlug: string,
    awaySlug: string
  ): Promise<{ calendarsId: string; key: string } | null> {
    const jNum = String(gameweekNumber).padStart(2, "0");
    const url = `${LNH_BASE}/daikin-starligue/calendriers/${seasonSlug}/lsl/j${jNum}/${homeSlug}/${awaySlug}`;
    const res = await this.fetchWithTimeout(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)" },
    });
    if (!res) return null;

    const html = await res.text();
    const idMatch = html.match(/name="calendars_id"\s+value="(\d+)"/);
    const keyMatch = html.match(/name="key"\s+value="(\d+)"/);
    if (!idMatch || !keyMatch) return null;

    return { calendarsId: idMatch[1]!, key: keyMatch[1]! };
  }

  // Récupère le boxscore (score LNH par joueur) d'un match précis déjà joué.
  async fetchMatchBoxscore(
    calendarsId: string,
    seasonsId: string,
    key: string
  ): Promise<ScrapedMatchBoxscoreRow[]> {
    const body = new URLSearchParams({
      contents_controller: "sportsCalendars",
      contents_action: "view_tab_stats",
      calendars_id: calendarsId,
      seasons_id: seasonsId,
      key,
    });

    const res = await this.fetchWithTimeout(AJAX_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)",
      },
      body: body.toString(),
    });
    if (!res) {
      throw new IngestionError(
        `LNH Scraper : impossible de récupérer le boxscore du match ${calendarsId}`,
        this.name,
        true
      );
    }

    const html = await res.text();
    return parseMatchBoxscoreHtml(html);
  }

  // Récupère les boxscores de plusieurs matchs déjà joués (ex : les ~8 matchs d'une
  // journée) en résolvant la clé CSRF une seule fois (vérifié interchangeable entre
  // STATS_URL et sportsCalendars — pas besoin d'un fetch de page match par match).
  async fetchGameweekMatchStats(
    calendarsIds: string[],
    seasonsId: string
  ): Promise<Map<string, ScrapedMatchBoxscoreRow[]>> {
    const ctx = await this.getFormContext();
    if (!ctx) {
      throw new IngestionError(
        "LNH Scraper : impossible de récupérer le contexte de formulaire depuis lnh.fr",
        this.name,
        true
      );
    }

    const results = new Map<string, ScrapedMatchBoxscoreRow[]>();
    for (const calendarsId of calendarsIds) {
      const rows = await this.fetchMatchBoxscore(calendarsId, seasonsId, ctx.key);
      results.set(calendarsId, rows);
    }
    return results;
  }

  // Récupère le calendrier complet d'une saison (240 matchs, un seul fetch — pas de
  // pagination nécessaire). `seasonStartYear` = première année de la saison (2025
  // pour "2025-2026"), sert à dater les matchs (le HTML n'indique pas l'année).
  async fetchSeasonCalendar(seasonsId: string, seasonStartYear: number): Promise<ScrapedFixture[]> {
    const res = await this.fetchWithTimeout(CALENDAR_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)" },
    });
    if (!res) {
      throw new IngestionError(`LNH Scraper : impossible de récupérer ${CALENDAR_URL}`, this.name, true);
    }
    const pageHtml = await res.text();
    const keyMatch = pageHtml.match(/name="key"\s+value="(\d+)"/);
    const cookie = res.headers.get("set-cookie") ?? "";
    if (!keyMatch) {
      throw new IngestionError("LNH Scraper : clé de formulaire calendrier introuvable", this.name, true);
    }

    const body = new URLSearchParams({
      contents_controller: "sportsCalendars",
      contents_action: "index_ajax",
      type: "all",
      type_id: "all",
      univers: "d1-26623",
      seasons_id: seasonsId,
      days_id: "all",
      teams_id: "all",
      current_month: "all",
      key: keyMatch[1]!,
    });

    const ajaxRes = await this.fetchWithTimeout(AJAX_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body.toString(),
    });
    if (!ajaxRes) {
      throw new IngestionError("LNH Scraper : impossible de récupérer le calendrier (ajaxpost1)", this.name, true);
    }

    const html = await ajaxRes.text();
    return parseCalendarFromHtml(html, seasonStartYear);
  }

  // Calendrier global lnh.fr (WARMUP_CALENDAR_URL, univers="matchs-6892") — même
  // recette que fetchSeasonCalendar (clé CSRF propre à cette page, pas réutilisable
  // depuis CALENDAR_URL). current_month="all" renvoie toute la saison en une requête
  // (vérifié le 2026-07-31 : 579 items dont 67 "Warm Up -", tous en août). Mécanique
  // HTTP partagée par fetchWarmupMatches et fetchCoupeDeFranceMatches — seul le
  // filtre de libellé appliqué ensuite par le parseur diffère.
  private async fetchFriendlyCalendarHtml(seasonsId: string): Promise<string> {
    const res = await this.fetchWithTimeout(WARMUP_CALENDAR_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)" },
    });
    if (!res) {
      throw new IngestionError(`LNH Scraper : impossible de récupérer ${WARMUP_CALENDAR_URL}`, this.name, true);
    }
    const pageHtml = await res.text();
    const keyMatch = pageHtml.match(/name="key"\s+value="(\d+)"/);
    const cookie = res.headers.get("set-cookie") ?? "";
    if (!keyMatch) {
      throw new IngestionError("LNH Scraper : clé de formulaire calendrier Warm Up introuvable", this.name, true);
    }

    const body = new URLSearchParams({
      contents_controller: "sportsCalendars",
      contents_action: "index_ajax",
      type: "all",
      type_id: "all",
      univers: WARMUP_UNIVERS,
      seasons_id: seasonsId,
      days_id: "all",
      teams_id: "all",
      current_month: "all",
      key: keyMatch[1]!,
    });

    const ajaxRes = await this.fetchWithTimeout(AJAX_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body.toString(),
    });
    if (!ajaxRes) {
      throw new IngestionError("LNH Scraper : impossible de récupérer le calendrier Warm Up (ajaxpost1)", this.name, true);
    }

    return ajaxRes.text();
  }

  async fetchWarmupMatches(seasonsId: string, seasonStartYear: number): Promise<ScrapedWarmupMatch[]> {
    const html = await this.fetchFriendlyCalendarHtml(seasonsId);
    return parseWarmupFromHtml(html, seasonStartYear);
  }

  // Coupe de France (labellisée "Coupe de France -" par la LNH sur ce même calendrier
  // global) — mêmes filtres "au moins un club Starligue actif" et mêmes conventions
  // logos/division que Warm Up côté ingestion (src/lib/ingestion/warmup.ts), stockée
  // dans la même table FriendlyMatch (competitionLabel distingue les deux à
  // l'affichage). Vérifié le 2026-08-01 : 12 matchs, tous le 30 août, mélange de
  // clubs Starligue et de clubs inférieurs français (Besançon, Massy...).
  async fetchCoupeDeFranceMatches(seasonsId: string, seasonStartYear: number): Promise<ScrapedWarmupMatch[]> {
    const html = await this.fetchFriendlyCalendarHtml(seasonsId);
    return parseCoupeDeFranceFromHtml(html, seasonStartYear);
  }

  // Récupère le classement officiel d'une saison (daikin-starligue/classement,
  // contents_controller=sportsStandings) — même schéma clé/cookie qu'un fetch de page
  // dédiée que fetchSeasonCalendar (le key est lié à la page, pas réutilisable depuis
  // STATS_URL ici, cf. fetchMatchCalendarsId). Une seule requête, pas de pagination
  // (16 clubs). `rank` fait autorité LNH — pas recalculé côté app pour la saison live.
  async fetchStandings(seasonsId: string): Promise<ScrapedStanding[]> {
    const res = await this.fetchWithTimeout(STANDINGS_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)" },
    });
    if (!res) {
      throw new IngestionError(`LNH Scraper : impossible de récupérer ${STANDINGS_URL}`, this.name, true);
    }
    const pageHtml = await res.text();
    const keyMatch = pageHtml.match(/name="key"\s+value="(\d+)"/);
    const cookie = res.headers.get("set-cookie") ?? "";
    if (!keyMatch) {
      throw new IngestionError("LNH Scraper : clé de formulaire classement introuvable", this.name, true);
    }

    const body = new URLSearchParams({
      contents_controller: "sportsStandings",
      contents_action: "index_ajax",
      univers: "d1-26623",
      seasons_id: seasonsId,
      key: keyMatch[1]!,
    });

    const ajaxRes = await this.fetchWithTimeout(AJAX_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body.toString(),
    });
    if (!ajaxRes) {
      throw new IngestionError("LNH Scraper : impossible de récupérer le classement (ajaxpost1)", this.name, true);
    }

    const html = await ajaxRes.text();
    return parseStandingsFromHtml(html);
  }

  // Liste les slugs de pages club Daikin StarLigue depuis la page listing (HTML statique)
  async fetchClubPageSlugs(): Promise<string[]> {
    const res = await this.fetchWithTimeout(CLUBS_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)" },
    });
    if (!res) {
      throw new IngestionError(`LNH Scraper : impossible de récupérer ${CLUBS_URL}`, this.name, true);
    }
    const html = await res.text();
    const slugs = new Set<string>();
    const re = /daikin-starligue\/equipes\/([a-z0-9-]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) slugs.add(m[1]!);
    return [...slugs];
  }

  // Récupère l'effectif publié sur la page d'un club (disponible avant même le
  // premier match joué de la saison, contrairement à la page stats)
  async fetchClubRoster(clubPageSlug: string): Promise<ScrapedPlayer[]> {
    const url = `${LNH_BASE}/daikin-starligue/equipes/${clubPageSlug}`;
    const res = await this.fetchWithTimeout(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)" },
    });
    if (!res) {
      throw new IngestionError(`LNH Scraper : impossible de récupérer ${url}`, this.name, true);
    }
    const html = await res.text();
    return parseRosterFromHtml(html);
  }

  // Effectifs de tous les clubs Daikin StarLigue (fallback de fetchPlayers())
  async fetchPlayersFromClubRosters(): Promise<ScrapedPlayer[]> {
    const slugs = await this.fetchClubPageSlugs();
    const allPlayers: ScrapedPlayer[] = [];
    for (const slug of slugs) {
      const players = await this.fetchClubRoster(slug);
      allPlayers.push(...players);
    }
    return allPlayers;
  }

  // --- Interface StarligueDataProvider (non supporté par ce provider) ---

  async fetchTeams(_season: string): Promise<ExternalTeam[]> {
    throw new IngestionError(
      "LnhScraperProvider ne supporte pas fetchTeams — utiliser ApiSportsProvider ou CSV",
      this.name,
      false
    );
  }

  async fetchFixtures(_season: string): Promise<ExternalFixture[]> {
    throw new IngestionError(
      "LnhScraperProvider ne supporte pas fetchFixtures — utiliser ApiSportsProvider ou CSV",
      this.name,
      false
    );
  }

  async fetchMatchPlayerStats(externalMatchId: string): Promise<ExternalPlayerStat[]> {
    throw new IngestionError(
      `Notes LNH introuvables pour le match ${externalMatchId}. ` +
      "L'API interne lnh.fr n'est pas accessible. Utiliser l'import CSV admin.",
      this.name,
      true
    );
  }

  // Sanity check : vérifie que lnh.fr est accessible
  async probe(): Promise<{ accessible: boolean; playersEndpoint: boolean }> {
    const ctx = await this.getFormContext();
    if (!ctx) return { accessible: false, playersEndpoint: false };

    // Test rapide : 1 joueur pour confirmer que l'endpoint AJAX répond
    const body = new URLSearchParams({
      contents_controller: "sportsPlayersStats",
      contents_action: "index_ajax",
      type: "joueurs",
      univers: "d1-26623",
      "pagination-items": "1",
      "pagination-current": "1",
      multi_teams_id: "all",
      multi_teams_against: "all",
      multi_days_id: "all",
      multi_positions_name: "Gardien",
      orderby: "",
      seasons_id: ctx.seasonsId,
      key: ctx.key,
    });

    const res = await this.fetchWithTimeout(AJAX_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        ...(ctx.cookie ? { Cookie: ctx.cookie } : {}),
      },
      body: body.toString(),
    });

    const html = res ? await res.text() : "";
    const hasPlayers = html.includes("daikin-starligue/joueurs/");

    return { accessible: true, playersEndpoint: hasPlayers };
  }
}

export function createLnhScraperProvider(): LnhScraperProvider {
  return new LnhScraperProvider();
}

// Schéma Zod non utilisé mais gardé pour compatibilité
const _PlayerStatSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  clubCode: z.string().optional(),
  rating: z.number().nullable().optional(),
  played: z.boolean().optional(),
});
