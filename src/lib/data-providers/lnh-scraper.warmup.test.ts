import { describe, it, expect } from "vitest";
import { parseWarmupFromHtml } from "./lnh-scraper.provider";

// Fragment fidèle à la structure réelle capturée sur lnh.fr/matchs/calendrier
// (contents_controller=sportsCalendars, univers=matchs-6892) — vérifié le
// 2026-07-31. Même famille de markup que le calendrier Daikin StarLigue
// (lnh-scraper.calendar.test.ts), mais compétition variable (Warm Up / Trophée des
// Champions / Coupe de France) et noms de club en clair pouvant contenir des
// entités HTML (ex: "Elite Val d&apos;Oise").
function item(opts: {
  id: string;
  competition: string; // ex: "Warm Up -", "Trophée des Champions - WUP", "Coupe de France -"
  date: string;
  homeSlug: string;
  homeName: string;
  homeHrefPrefix?: string; // ex: "proligue/" — omis = href bare (club étranger)
  awaySlug: string;
  awayName: string;
  awayHrefPrefix?: string;
  score?: string; // ex: "26 - 28", absent si pas encore joué
}): string {
  const scoreHtml = opts.score
    ? `<div class="scores is-finish">${opts.score}</div>`
    : `<div class="scores is-coming">vs</div>`;
  return `
<div class="calendars-listing-item listing-item waiting  "
    id="${opts.id}">
    <div class="row">
        <div class="col-infos">
            <div class="col-competitions">
                <span class="competition">
                    ${opts.competition}
                </span>
                <br>
                ${opts.date}
            </div>
        </div>
    </div>
    <div class="clear"></div>
    <div class="row">
        <div class="col-teams">
            <div class="teams-logos">
                <div class="team-logo">
                    <a href="https://www.lnh.fr/${opts.homeHrefPrefix ?? ""}equipes/x" title="Home">
                        <img src="https://www.lnh.fr/medias/sports_teams/${opts.homeSlug}__logo__2024-2025.png" alt="logo" />
                    </a>
                    <div class="team-name">${opts.homeName}</div>
                </div>
                ${scoreHtml}
                <div class="team-logo">
                    <a href="https://www.lnh.fr/${opts.awayHrefPrefix ?? ""}equipes/y" title="Away">
                        <img src="https://www.lnh.fr/medias/sports_teams/${opts.awaySlug}__logo__2023-2024.png" alt="logo" />
                    </a>
                    <div class="team-name">${opts.awayName}</div>
                </div>
            </div>
        </div>
    </div>
</div>`;
}

describe("parseWarmupFromHtml", () => {
  it("extracts a finished Warm Up match with its calendars_id, clubs and score", () => {
    const html = item({
      id: "11599",
      competition: "Warm Up -",
      date: "dim. 03 août 20h00",
      homeSlug: "rhein-neckar-lowen",
      homeName: "Rhein-Neckar Löwen",
      awaySlug: "paris",
      awayName: "Paris",
      score: "26 - 28",
    });
    const matches = parseWarmupFromHtml(html, 2026);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      calendarsId: "11599",
      competitionLabel: "Warm Up",
      homeClubSlug: "rhein-neckar-lowen",
      homeClubName: "Rhein-Neckar Löwen",
      homeClubLogoUrl: "https://www.lnh.fr/medias/sports_teams/rhein-neckar-lowen__logo__2024-2025.png",
      homeClubDivision: null, // href bare "equipes/…" — club étranger, pas de segment
      awayClubSlug: "paris",
      awayClubName: "Paris",
      status: "FINISHED",
      homeScore: 26,
      awayScore: 28,
    });
  });

  it("extracts the division segment from a club's href when present (e.g. proligue)", () => {
    const matches = parseWarmupFromHtml(
      item({
        id: "1",
        competition: "Warm Up -",
        date: "sam. 01 août 18h00",
        homeSlug: "saran",
        homeName: "Saran",
        homeHrefPrefix: "proligue/",
        awaySlug: "chartres",
        awayName: "Chartres",
        awayHrefPrefix: "daikin-starligue/",
      }),
      2026
    );
    expect(matches[0]).toMatchObject({ homeClubDivision: "proligue", awayClubDivision: "daikin-starligue" });
  });

  it("keeps Trophée des Champions - WUP but excludes TDC and Coupe de France", () => {
    const html = [
      item({
        id: "1",
        competition: "Trophée des Champions - WUP",
        date: "sam. 29 août 17h00",
        homeSlug: "aix",
        homeName: "Aix",
        awaySlug: "toyoda-gosei",
        awayName: "Toyoda Gosei",
      }),
      item({
        id: "2",
        competition: "Trophée des Champions - TDC",
        date: "sam. 29 août 20h00",
        homeSlug: "paris",
        homeName: "Paris",
        awaySlug: "montpellier",
        awayName: "Montpellier",
      }),
      item({
        id: "3",
        competition: "Coupe de France -",
        date: "dim. 30 août 15h00",
        homeSlug: "dunkerque",
        homeName: "Dunkerque",
        awaySlug: "caen",
        awayName: "Caen",
      }),
    ].join("\n");
    const matches = parseWarmupFromHtml(html, 2026);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ calendarsId: "1", competitionLabel: "Trophée des Champions - WUP" });
  });

  it("decodes HTML entities in club names (e.g. apostrophe)", () => {
    const matches = parseWarmupFromHtml(
      item({
        id: "1",
        competition: "Warm Up -",
        date: "mer. 05 août 17h30",
        homeSlug: "cherbourg",
        homeName: "Cherbourg",
        awaySlug: "elite-val-d-oise",
        awayName: "Elite Val d&apos;Oise",
      }),
      2026
    );
    expect(matches[0]!.awayClubName).toBe("Elite Val d'Oise");
  });

  it("marks a match with no final score as SCHEDULED with null scores", () => {
    const matches = parseWarmupFromHtml(
      item({
        id: "1",
        competition: "Warm Up -",
        date: "sam. 01 août 18h00",
        homeSlug: "saran",
        homeName: "Saran",
        awaySlug: "chartres",
        awayName: "Chartres",
      }),
      2026
    );
    expect(matches[0]).toMatchObject({ status: "SCHEDULED", homeScore: null, awayScore: null });
  });

  it("parses multiple items in one response", () => {
    const html = [
      item({
        id: "1",
        competition: "Warm Up -",
        date: "sam. 01 août 18h00",
        homeSlug: "a",
        homeName: "A",
        awaySlug: "b",
        awayName: "B",
      }),
      item({
        id: "2",
        competition: "Warm Up -",
        date: "sam. 08 août 18h00",
        homeSlug: "c",
        homeName: "C",
        awaySlug: "d",
        awayName: "D",
      }),
    ].join("\n");
    const matches = parseWarmupFromHtml(html, 2026);
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.calendarsId)).toEqual(["1", "2"]);
  });

  it("returns an empty array for a page with no calendar items", () => {
    expect(parseWarmupFromHtml("<div>rien</div>", 2026)).toEqual([]);
  });
});
