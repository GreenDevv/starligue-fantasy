import { describe, it, expect } from "vitest";
import { parseCalendarFromHtml } from "./lnh-scraper.provider";

// Fragment fidèle à la structure réelle capturée sur daikin-starligue/calendrier
// (contents_controller=sportsCalendars, seasons_id=39, saison 2025/2026 terminée) —
// vérifié le 2026-07-15. L'attribut `id` du wrapper EST le calendars_id utilisé par
// fetchMatchBoxscore (confirmé : id="11234" correspond exactement au calendars_id
// résolu indépendamment depuis la page de détail du même match).
function item(opts: {
  id: string;
  gw: number;
  date: string; // ex: "05 sept. 20h00" ou "03 avril 20h00" (forme longue pour certains mois)
  homeSlug: string;
  awaySlug: string;
  score?: string; // ex: "34 - 30", absent si pas encore joué
  // Diffuseur TV (bloc "col-tv") — absent d'une majorité de fixtures de test, un seul
  // représentant réel utilisé par match : "bein" (beIN Sport) ou "htv" (Handball TV).
  tv?: { logoFile: string; href: string };
}): string {
  const scoreHtml = opts.score
    ? `<div class="scores is-finish">${opts.score}</div>`
    : `<div class="scores">-</div>`;
  const tvHtml = opts.tv
    ? `<div class="col-tv">
                <div class="tv-icon">
                    <a href="${opts.tv.href}" target="_blank" class="tv-link">
                        <img src="https://www.lnh.fr/medias/televisions/${opts.tv.logoFile}" />
                    </a>
                </div>
            </div>`
    : "";
  return `
<div class="calendars-listing-item listing-item finish  lmsl"
    id="${opts.id}">
    <div class="row">
        <div class="col-infos">
            <div class="col-competitions">
                <span class="competition">
                    Daikin StarLigue - J${String(opts.gw).padStart(2, "0")}
                </span>
                <br>
                ${opts.date}
            </div>
            ${tvHtml}
        </div>
    </div>
    <div class="clear"></div>
    <div class="row">
        <div class="col-teams">
            <div class="teams-logos">
                <div class="team-logo">
                    <a href="https://www.lnh.fr/daikin-starligue/equipes/x" title="Home">
                        <img src="https://www.lnh.fr/medias/sports_teams/${opts.homeSlug}__logo__2024-2025.png" alt="logo" />
                    </a>
                    <div class="team-name">Home</div>
                </div>
                ${scoreHtml}
                <div class="team-logo">
                    <a href="https://www.lnh.fr/daikin-starligue/equipes/y" title="Away">
                        <img src="https://www.lnh.fr/medias/sports_teams/${opts.awaySlug}__logo__2023-2024.png" alt="logo" />
                    </a>
                    <div class="team-name">Away</div>
                </div>
            </div>
        </div>
    </div>
</div>`;
}

describe("parseCalendarFromHtml", () => {
  it("extracts a finished match with its calendars_id, clubs, score and gameweek", () => {
    const html = item({
      id: "11234",
      gw: 30,
      date: "sam. 06 juin 20h30",
      homeSlug: "montpellier",
      awaySlug: "nimes",
      score: "34 - 30",
    });
    const fixtures = parseCalendarFromHtml(html, 2025);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0]).toMatchObject({
      gameweekNumber: 30,
      calendarsId: "11234",
      homeClubSlug: "montpellier",
      awayClubSlug: "nimes",
      status: "FINISHED",
      homeScore: 34,
      awayScore: 30,
    });
  });

  it("infers the second season year for a spring month (juin) and the first for autumn (sept.)", () => {
    const autumn = parseCalendarFromHtml(
      item({ id: "1", gw: 1, date: "ven. 05 sept. 20h00", homeSlug: "a", awaySlug: "b", score: "1 - 1" }),
      2025
    );
    const spring = parseCalendarFromHtml(
      item({ id: "2", gw: 30, date: "sam. 06 juin 20h30", homeSlug: "a", awaySlug: "b", score: "1 - 1" }),
      2025
    );
    expect(autumn[0]!.kickoffAt.getUTCFullYear()).toBe(2025);
    expect(spring[0]!.kickoffAt.getUTCFullYear()).toBe(2026);
  });

  it("handles a month written in full (avril) as well as abbreviated forms (déc.)", () => {
    const full = parseCalendarFromHtml(
      item({ id: "1", gw: 22, date: "jeu. 03 avril 20h00", homeSlug: "a", awaySlug: "b", score: "1 - 1" }),
      2025
    );
    const abbrev = parseCalendarFromHtml(
      item({ id: "2", gw: 15, date: "ven. 12 déc. 20h00", homeSlug: "a", awaySlug: "b", score: "1 - 1" }),
      2025
    );
    expect(full[0]!.kickoffAt.getUTCMonth()).toBe(3); // avril = index 3
    expect(abbrev[0]!.kickoffAt.getUTCMonth()).toBe(11); // décembre = index 11
  });

  it("marks a match with no final score as SCHEDULED with null scores", () => {
    const fixtures = parseCalendarFromHtml(
      item({ id: "1", gw: 1, date: "ven. 05 sept. 20h00", homeSlug: "a", awaySlug: "b" }),
      2025
    );
    expect(fixtures[0]).toMatchObject({ status: "SCHEDULED", homeScore: null, awayScore: null });
  });

  it("parses multiple items in one response", () => {
    const html = [
      item({ id: "1", gw: 1, date: "ven. 05 sept. 20h00", homeSlug: "a", awaySlug: "b", score: "20 - 25" }),
      item({ id: "2", gw: 1, date: "ven. 05 sept. 20h00", homeSlug: "c", awaySlug: "d", score: "30 - 28" }),
    ].join("\n");
    const fixtures = parseCalendarFromHtml(html, 2025);
    expect(fixtures).toHaveLength(2);
    expect(fixtures.map((f) => f.calendarsId)).toEqual(["1", "2"]);
  });

  it("returns an empty array for a page with no calendar items", () => {
    expect(parseCalendarFromHtml("<div>rien</div>", 2025)).toEqual([]);
  });

  it("extracts the broadcaster name and link from the col-tv block (beIN Sport)", () => {
    const fixtures = parseCalendarFromHtml(
      item({
        id: "1",
        gw: 1,
        date: "dim. 06 sept. 17h00",
        homeSlug: "caen",
        awaySlug: "dunkerque",
        tv: { logoFile: "bein-web_655584996.png", href: "https://sabonner.beinsports.com/" },
      }),
      2025
    );
    expect(fixtures[0]).toMatchObject({
      broadcasterName: "beIN Sport",
      broadcasterUrl: "https://sabonner.beinsports.com/",
    });
  });

  it("extracts the broadcaster name and link from the col-tv block (Handball TV)", () => {
    const fixtures = parseCalendarFromHtml(
      item({
        id: "1",
        gw: 1,
        date: "ven. 05 sept. 20h00",
        homeSlug: "a",
        awaySlug: "b",
        tv: { logoFile: "htvsmall_886758244.png", href: "https://www.handballtv.fr/calendar" },
      }),
      2025
    );
    expect(fixtures[0]).toMatchObject({
      broadcasterName: "Handball TV",
      broadcasterUrl: "https://www.handballtv.fr/calendar",
    });
  });

  it("leaves broadcasterName/broadcasterUrl null when the col-tv block is absent", () => {
    const fixtures = parseCalendarFromHtml(
      item({ id: "1", gw: 1, date: "ven. 05 sept. 20h00", homeSlug: "a", awaySlug: "b" }),
      2025
    );
    expect(fixtures[0]).toMatchObject({ broadcasterName: null, broadcasterUrl: null });
  });

  it("ignores an unrecognized broadcaster logo file rather than exposing a raw slug", () => {
    const fixtures = parseCalendarFromHtml(
      item({
        id: "1",
        gw: 1,
        date: "ven. 05 sept. 20h00",
        homeSlug: "a",
        awaySlug: "b",
        tv: { logoFile: "somenewbroadcaster_123.png", href: "https://example.com" },
      }),
      2025
    );
    expect(fixtures[0]).toMatchObject({ broadcasterName: null, broadcasterUrl: null });
  });
});
