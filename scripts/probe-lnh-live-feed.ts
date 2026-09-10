// Reconnaissance du feed live lnh.fr (D1 masculin) — à lancer PENDANT un match en
// direct (ou juste après). Le feed « eStatsChannels » n'a jamais été observé
// (mémoire live_match_center_vision) ; ce script tape plusieurs variantes de
// l'endpoint AJAX et dump chaque réponse dans scratch/lnh-live/ pour inspection,
// avant d'écrire un parser (Lot 4 de la feature "états de journée").
//
// Usage :
//   npx tsx scripts/probe-lnh-live-feed.ts <calendars_id> [seasons_id=40]
//
// <calendars_id> : l'id interne lnh.fr du match (Match.externalIds.lnh_calendars_id
//   en base, ou name="calendars_id" value="..." sur la page de détail du match).
//
// Une fois le format compris : documenter dans ARCHITECTURE.md §4.x, ajouter
// fetchLiveMatchState() dans lnh-scraper.provider.ts + un cron rapproché.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LNH_BASE = "https://www.lnh.fr";
const calendarsId = process.argv[2];
const seasonsId = process.argv[3] ?? "40";

if (!calendarsId) {
  console.error("Usage: npx tsx scripts/probe-lnh-live-feed.ts <calendars_id> [seasons_id]");
  process.exit(1);
}

const OUT_DIR = join(process.cwd(), "scratch", "lnh-live");
mkdirSync(OUT_DIR, { recursive: true });

const HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded",
  "X-Requested-With": "XMLHttpRequest",
  "User-Agent": "Mozilla/5.0 (compatible; StarligueFantasyBot/1.0)",
};

// Variantes candidates : mêmes conventions que fetchMatchBoxscore
// (contents_controller=sportsCalendars, contents_action=view_tab_stats) mais pour
// l'onglet "live" / "feuille de match" / "commentaires".
const ATTEMPTS: { name: string; path: string; body: Record<string, string> }[] = [
  { name: "ajaxpost1-view_tab_live", path: "/ajaxpost1", body: { contents_controller: "sportsCalendars", contents_action: "view_tab_live", calendars_id: calendarsId, seasons_id: seasonsId } },
  { name: "ajaxpost1-view_tab_matchsheet", path: "/ajaxpost1", body: { contents_controller: "sportsCalendars", contents_action: "view_tab_matchsheet", calendars_id: calendarsId, seasons_id: seasonsId } },
  { name: "ajaxpost1-view_tab_comments", path: "/ajaxpost1", body: { contents_controller: "sportsCalendars", contents_action: "view_tab_comments", calendars_id: calendarsId, seasons_id: seasonsId } },
  { name: "ajaxpost1-view_tab_timeline", path: "/ajaxpost1", body: { contents_controller: "sportsCalendars", contents_action: "view_tab_timeline", calendars_id: calendarsId, seasons_id: seasonsId } },
  { name: "ajaxpost1-eStatsChannels", path: "/ajaxpost1", body: { contents_controller: "eStatsChannels", contents_action: "index_ajax", calendars_id: calendarsId, seasons_id: seasonsId } },
  { name: "ajaxlive-calendars_id", path: "/ajaxlive", body: { calendars_id: calendarsId, seasons_id: seasonsId } },
  { name: "ajaxlive-eStatsChannels", path: "/ajaxlive", body: { contents_controller: "eStatsChannels", calendars_id: calendarsId } },
];

async function main() {
  const summary: string[] = [];
  for (const a of ATTEMPTS) {
    try {
      const res = await fetch(`${LNH_BASE}${a.path}`, {
        method: "POST",
        headers: HEADERS,
        body: new URLSearchParams(a.body).toString(),
        signal: AbortSignal.timeout(20_000),
      });
      const text = await res.text();
      const ct = res.headers.get("content-type") ?? "";
      const ext = ct.includes("json") ? "json" : ct.includes("html") ? "html" : "txt";
      const file = join(OUT_DIR, `${a.name}.${ext}`);
      writeFileSync(file, text);
      const line = `${a.name} → ${res.status} · ${ct} · ${text.length}b → ${file}`;
      console.log(line);
      summary.push(line + (text.length > 0 && text.length < 300 ? `\n    ${text.replace(/\s+/g, " ").slice(0, 280)}` : ""));
    } catch (err) {
      const line = `${a.name} → ERREUR ${String(err)}`;
      console.log(line);
      summary.push(line);
    }
  }
  writeFileSync(join(OUT_DIR, "_summary.txt"), summary.join("\n\n") + "\n");
  console.log(`\nRésumé → ${join(OUT_DIR, "_summary.txt")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
