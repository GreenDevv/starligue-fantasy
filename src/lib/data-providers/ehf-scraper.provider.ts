// Source EHF (European Handball Federation) pour les coupes d'Europe — EHF
// Champions League (ehfcl.eurohandball.com) et EHF European League
// (ehfel.eurohandball.com), demandées explicitement par l'utilisateur en complément
// de Warm Up/Coupe de France (ARCHITECTURE.md §19), même principe : une compétition
// hors championnat dont les résultats/à venir sont fusionnés dans FriendlyMatch.
//
// Contrairement à lnh.fr (HTML scrapé, cf. lnh-scraper.provider.ts), c'est une vraie
// API JSON (endpoint Umbraco découvert par inspection réseau) : pas de parsing HTML
// complexe nécessaire pour les matchs eux-mêmes, validation Zod du payload comme
// ApiSportsProvider (seul autre provider consommant une API JSON externe dans ce
// projet). Les deux sites (ehfcl./ehfel.) partagent exactement la même API et la
// même structure de page — une seule implémentation générique (fetchEhfCompetitionMatches)
// paramétrée par l'URL de la page "matchs" de la saison, réutilisée par les deux
// coupes.
//
// contentId/competitionId (identifiants Umbraco internes, opaques) ne sont PAS codés
// en dur : contrairement à un premier jet qui les avait figés en constantes (fragile
// — à remettre à jour chaque saison, et cassé net si la page n'existe pas encore),
// ils sont découverts dynamiquement en scrapant la page HTML de la saison
// (`data-currentcontentid`/`data-competition-id`, présents dans le HTML servi côté
// serveur, pas seulement après hydratation JS — vérifié le 2026-08-02). Avantage
// concret : la EHF European League 2026/27 hommes n'existe pas encore au moment
// d'écrire ce code (`https://ehfel.eurohandball.com/men/2026-27/matches/` répond
// 404, confirmé par l'utilisateur ET vérifié directement) — avec des IDs codés en
// dur il aurait fallu attendre la publication de la page pour les récupérer puis
// modifier le code. Avec la découverte dynamique, le code déployé aujourd'hui
// commencera à fonctionner tout seul dès qu'EHF publiera la page, sans changement.
//
// Résolution du club Starligue correspondant à une équipe EHF : par correspondance
// de NOM (normalisé, mots de bruit "handball"/"hb"/"hc"/"hbc"/"club" retirés des deux
// côtés avant comparaison), pas par une table figée par compétition — l'API EHF
// n'expose aucun identifiant partagé avec lnh.fr. Vérifié empiriquement le
// 2026-08-02 sur les vrais noms EHF : "HBC Nantes" / "Montpellier Handball" /
// "Paris Saint-Germain" (EHF CL 2026/27) et "Fenix Toulouse" / "Montpellier
// Handball" / "Saint-Raphael Var Handball" (EHF EL 2025/26, dernière édition
// publiée) matchent tous correctement leur club en DB malgré des écarts de forme
// (accents absents côté EHF, suffixe "Handball" tantôt présent tantôt non des deux
// côtés) — voir resolveClubSlug.
import { z } from "zod";
import { IngestionError, type ScrapedWarmupMatch } from "@/lib/data-providers/lnh-scraper.provider";

export const EHF_CHAMPIONS_LEAGUE_LABEL = "EHF Champions League";
export const EHF_EUROPEAN_LEAGUE_LABEL = "EHF European League";

const EHF_CHAMPIONS_LEAGUE_URL = "https://ehfcl.eurohandball.com/men/2026-27/matches/";
const EHF_EUROPEAN_LEAGUE_URL = "https://ehfel.eurohandball.com/men/2026-27/matches/";
// Page "clubs" de la saison — source de logos plus complète que l'API matchs (voir
// fetchClubLogos plus bas) : contrairement à data-currentcontentid/competition-id,
// cette URL ne varie pas d'une compétition à l'autre, seul le domaine change (même
// chemin /men/2026-27/clubs/ sur les deux sites).
const EHF_CHAMPIONS_LEAGUE_CLUBS_URL = "https://ehfcl.eurohandball.com/men/2026-27/clubs/";
const EHF_EUROPEAN_LEAGUE_CLUBS_URL = "https://ehfel.eurohandball.com/men/2026-27/clubs/";

// ---- Résolution du club (nom EHF → slug lnh.fr connu, ou slug dérivé si inconnu) ----

const CLUB_NAME_NOISE_WORDS = new Set(["handball", "hand", "hb", "hc", "hbc", "club"]);

// "Paris Saint-Germain Handball" / "Paris Saint-Germain" → "paris saint germain" —
// mots de bruit retirés des DEUX côtés avant comparaison (voir commentaire d'en-tête
// pour les cas réels vérifiés). Comparaison stricte après normalisation (pas de
// sous-chaîne floue) : un club non reconnu reste simplement non reconnu (traité comme
// hors DB, comportement identique à un adversaire Warm Up de D2/étranger) plutôt que
// de risquer un faux positif.
function normalizeCoreClubName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 0 && !CLUB_NAME_NOISE_WORDS.has(w))
    .join(" ")
    .trim();
}

// "SAH - Aarhus" → "sah-aarhus" ; "RK Celje Pivovarna Laško" → "rk-celje-pivovarna-lasko"
// — utilisé seulement pour un club non reconnu (hors Starligue), juste besoin d'un
// identifiant stable et lisible, pas de sens particulier.
function slugifyTeamName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveClubSlug(ehfName: string, knownClubs: { slug: string; name: string }[]): string {
  const core = normalizeCoreClubName(ehfName);
  const match = knownClubs.find((c) => normalizeCoreClubName(c.name) === core);
  return match?.slug ?? slugifyTeamName(ehfName);
}

// ---- Zod schema pour la réponse EHF (sous-ensemble des champs utilisés) ----

const EhfTeamSchema = z.object({
  team: z.object({
    name: z.string(),
    logoSmall: z.string().nullable().optional(),
    logoBig: z.string().nullable().optional(),
    nationAbbreviation: z.string().nullable().optional(),
  }),
  score: z.object({
    goals: z.number().nullable(),
  }),
});

const EhfMatchSchema = z.object({
  matchID: z.string(),
  venue: z.object({
    date: z.object({ utc: z.string() }),
  }),
  homeTeam: EhfTeamSchema,
  guestTeam: EhfTeamSchema,
});

const EhfMatchesResponseSchema = z.object({
  matches: z.array(EhfMatchSchema),
});

export type EhfMatch = z.infer<typeof EhfMatchSchema>;

// Fonction pure (testée) — mappe un match EHF brut vers la forme commune
// ScrapedWarmupMatch, réutilisée telle quelle par syncFriendlyMatches
// (src/lib/ingestion/warmup.ts), quel que soit le club encore engagé ou non côté
// Starligue (le filtre "au moins un club actif" est appliqué en aval, comme pour
// Warm Up/Coupe de France).
export function mapEhfMatch(m: EhfMatch, competitionLabel: string, knownClubs: { slug: string; name: string }[]): ScrapedWarmupMatch {
  const home = m.homeTeam.team;
  const away = m.guestTeam.team;
  const homeGoals = m.homeTeam.score.goals;
  const awayGoals = m.guestTeam.score.goals;
  const decided = homeGoals !== null && awayGoals !== null;

  return {
    calendarsId: m.matchID,
    competitionLabel,
    homeClubSlug: resolveClubSlug(home.name, knownClubs),
    homeClubName: home.name,
    homeClubLogoUrl: home.logoBig ?? home.logoSmall ?? "",
    homeClubDivision: home.nationAbbreviation ?? null,
    awayClubSlug: resolveClubSlug(away.name, knownClubs),
    awayClubName: away.name,
    awayClubLogoUrl: away.logoBig ?? away.logoSmall ?? "",
    awayClubDivision: away.nationAbbreviation ?? null,
    kickoffAt: new Date(m.venue.date.utc),
    status: decided ? "FINISHED" : "SCHEDULED",
    homeScore: homeGoals,
    awayScore: awayGoals,
  };
}

async function fetchText(url: string): Promise<string> {
  let res: Response;
  try {
    res = await globalThis.fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new IngestionError(`EHF Scraper : requête impossible (${String(err)})`, "EHF_SCRAPER", true);
  }
  if (res.status === 404) {
    // Page saison pas encore publiée par EHF (cas attendu pour EHF European League
    // 2026/27 au moment d'écrire ce code) — récupérable : simplement rien à
    // synchroniser tant que la page n'existe pas, pas une vraie erreur.
    throw new IngestionError(`EHF Scraper : page saison introuvable (${url})`, "EHF_SCRAPER", true);
  }
  if (!res.ok) {
    throw new IngestionError(`EHF Scraper : HTTP ${res.status} sur ${url}`, "EHF_SCRAPER", true);
  }
  return res.text();
}

async function fetchJson(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await globalThis.fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new IngestionError(`EHF Scraper : requête impossible (${String(err)})`, "EHF_SCRAPER", true);
  }
  if (!res.ok) {
    throw new IngestionError(`EHF Scraper : HTTP ${res.status} sur ${url}`, "EHF_SCRAPER", true);
  }
  return res.json();
}

// data-currentcontentid="138649" / data-competition-id="-Gd1tlJGDXtuVGsp4I0Chg" —
// attributs présents sur le conteneur du tableau de résultats, servis dans le HTML
// initial (pas seulement après hydratation Vue), vérifié le 2026-08-02 sur
// ehfcl.eurohandball.com ET ehfel.eurohandball.com (même gabarit de page). Extrait
// par regex plutôt qu'un vrai parseur DOM (pas de dépendance HTML supplémentaire
// dans ce projet, cf. lnh-scraper.provider.ts qui fait de même).
function extractCompetitionIds(html: string): { contentId: string; competitionId: string } {
  const contentIdMatch = html.match(/data-currentcontentid="(\d+)"/);
  const competitionIdMatch = html.match(/data-competition-id="([^"]+)"/);
  if (!contentIdMatch || !competitionIdMatch) {
    throw new IngestionError("EHF Scraper : contentId/competitionId introuvables dans la page", "EHF_SCRAPER", true);
  }
  return { contentId: contentIdMatch[1]!, competitionId: competitionIdMatch[1]! };
}

// Garde-fou très large (saison complète phase de groupes + barrages/Final4 : de
// l'ordre de 150-350 matchs au total selon la compétition) — n'est jamais censé être
// atteint en usage normal, protège seulement contre une boucle infinie si l'API
// change de comportement.
const MAX_CURSOR_ATTEMPTS = 1500;

// Pagination par curseur (matchId + futureMatches=true/false) dont la sémantique
// exacte n'est pas documentée par EHF et ne suit ni l'ordre chronologique ni l'ordre
// du tableau retourné (vérifié empiriquement le 2026-08-02 : un curseur donné peut
// renvoyer un mélange de matchs déjà vus et de nouveaux, dans un ordre qui ne
// correspond à aucun tri simple). On explore donc en largeur (flood-fill) dans les
// deux sens (futureMatches=true ET false) : chaque matchId découvert est à son tour
// essayé comme curseur dans les deux directions, jusqu'à épuisement. Coûteux en
// requêtes (~2 par match) mais garantit l'exhaustivité sans dépendre d'une hypothèse
// fragile sur l'algorithme de pagination du site — et couvre aussi bien les matchs à
// venir que ceux déjà joués (nécessaire : une fois un match joué, rien ne prouve
// qu'il reste atteignable par une pagination futureMatches=true seule). Acceptable
// pour un cron quotidien (pas de contrainte de latence utilisateur).
async function fetchAllMatches(apiBase: string, contentId: string, competitionId: string): Promise<EhfMatch[]> {
  const seen = new Map<string, EhfMatch>();
  const queue: { matchId: string; future: boolean }[] = [];
  const tried = new Set<string>();

  const initJson = EhfMatchesResponseSchema.parse(
    await fetchJson(`${apiBase}/GetInitMatches?contentId=${contentId}&competitionId=${competitionId}`)
  );
  for (const m of initJson.matches) {
    seen.set(m.matchID, m);
    queue.push({ matchId: m.matchID, future: true }, { matchId: m.matchID, future: false });
  }

  let attempts = 0;
  while (queue.length > 0 && attempts < MAX_CURSOR_ATTEMPTS) {
    const { matchId, future } = queue.shift()!;
    const key = `${matchId}:${future}`;
    if (tried.has(key)) continue;
    tried.add(key);
    attempts++;

    const url = `${apiBase}/GetMatches?contentId=${contentId}&competitionId=${competitionId}&matchId=${matchId}&futureMatches=${future}`;
    const json = EhfMatchesResponseSchema.parse(await fetchJson(url));
    for (const m of json.matches) {
      if (!seen.has(m.matchID)) {
        seen.set(m.matchID, m);
        queue.push({ matchId: m.matchID, future: true }, { matchId: m.matchID, future: false });
      }
    }
  }

  return [...seen.values()];
}

function apiBaseForUrl(pageUrl: string): string {
  const { origin } = new URL(pageUrl);
  return `${origin}/umbraco/api/competitionmatchesapi`;
}

// Fonction générique partagée par les deux coupes — voir commentaire d'en-tête.
// `knownClubs` : clubs Starligue actifs cette saison (slug lnh.fr + nom), pour
// résoudre homeClubSlug/awayClubSlug par correspondance de nom (resolveClubSlug).
export async function fetchEhfCompetitionMatches(
  pageUrl: string,
  competitionLabel: string,
  knownClubs: { slug: string; name: string }[]
): Promise<ScrapedWarmupMatch[]> {
  const html = await fetchText(pageUrl);
  const { contentId, competitionId } = extractCompetitionIds(html);
  const apiBase = apiBaseForUrl(pageUrl);
  const matches = await fetchAllMatches(apiBase, contentId, competitionId);
  return matches.map((m) => mapEhfMatch(m, competitionLabel, knownClubs));
}

export function fetchChampionsLeagueMatches(knownClubs: { slug: string; name: string }[]): Promise<ScrapedWarmupMatch[]> {
  return fetchEhfCompetitionMatches(EHF_CHAMPIONS_LEAGUE_URL, EHF_CHAMPIONS_LEAGUE_LABEL, knownClubs);
}

export function fetchEuropeanLeagueMatches(knownClubs: { slug: string; name: string }[]): Promise<ScrapedWarmupMatch[]> {
  return fetchEhfCompetitionMatches(EHF_EUROPEAN_LEAGUE_URL, EHF_EUROPEAN_LEAGUE_LABEL, knownClubs);
}

// ---- Logos des clubs (page "clubs" de la saison, pas l'API matchs) ----

// L'API matchs (homeTeam.team.logoBig/logoSmall) est incomplète : plusieurs clubs
// n'ont AUCUN logo sur AUCUN de leurs matchs (vérifié le 2026-08-02 sur 5 clubs EHF
// CL 2026/27 : Aalborg Håndbold, Barça, HC Vardar 1961, Orlen Wisla Plock, RK Celje
// Pivovarna Laško — logoBig ET logoSmall null sur la totalité de leurs matchs
// respectifs). La page "clubs" de la saison (`/men/{saison}/clubs/`, distincte de
// la page "matchs") liste elle TOUS les clubs avec logo, servie en HTML brut sans
// JS (comme la page matchs pour contentId/competitionId) — structure par bloc
// `class="tg-item"` (nom en clair dans `<span class="tg-name">`, logo dans
// `data-src`, chargement différé côté site mais l'attribut est déjà présent dans le
// HTML initial). Utilisée uniquement par le backfill de logos
// (scripts/backfill-ehf-logos.ts) — la synchro des matchs elle-même ne consomme
// plus aucune URL de logo hotlinkée (résolution 100% locale, voir
// src/lib/ingestion/warmup.ts).
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCharCode(Number(dec)))
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

// Fonction pure (testée) — nom de club (tel qu'affiché sur le site, même forme que
// team.name côté API matchs) → URL de logo.
export function parseClubLogosFromHtml(html: string): Map<string, string> {
  const logos = new Map<string, string>();
  const items = html.split('class="tg-item"').slice(1);
  for (const raw of items) {
    const srcMatch = raw.match(/data-src="([^"]+)"/);
    const nameMatch = raw.match(/<span class="tg-name">([^<]+)<\/span>/);
    if (!srcMatch || !nameMatch) continue;
    logos.set(decodeHtmlEntities(nameMatch[1]!.trim()), srcMatch[1]!);
  }
  return logos;
}

async function fetchClubLogos(clubsPageUrl: string): Promise<Map<string, string>> {
  const html = await fetchText(clubsPageUrl);
  return parseClubLogosFromHtml(html);
}

export function fetchChampionsLeagueClubLogos(): Promise<Map<string, string>> {
  return fetchClubLogos(EHF_CHAMPIONS_LEAGUE_CLUBS_URL);
}

export function fetchEuropeanLeagueClubLogos(): Promise<Map<string, string>> {
  return fetchClubLogos(EHF_EUROPEAN_LEAGUE_CLUBS_URL);
}
