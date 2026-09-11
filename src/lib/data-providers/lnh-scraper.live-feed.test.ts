import { describe, it, expect } from "vitest";
import { parseLiveMatchFeedHtml, parseLiveIndexHtml } from "./lnh-scraper.provider";

// Structure fidèle au HTML réel capturé le 2026-09-11 (scripts/probe-lnh-live-feed.ts,
// J02 Limoges–Saran, contents_action=view_tab_live) : table `table-stats events`,
// une <tr> par événement DU PLUS RÉCENT AU PLUS ANCIEN.
function row(opts: { icon: string; min: string; home: number; away: number; event: string }): string {
  return `
  <tr class="">
    <td><div class="event-icon ${opts.icon}"></div></td>
    <td>
      <div class="event-cell-time">
        <span><b>${opts.min}</b></span>
        <div class="cell-game">
          <div class="team home"><div class="team-logo"><img src="x" /></div></div>
          <div class="score">${opts.home} - ${opts.away}\t\t</div>
          <div class="team away"><div class="team-logo"><img src="y" /></div></div>
        </div>
      </div>
    </td>
    <td><div class="cell-event">${opts.event}    \t</div></td>
  </tr>`;
}

function feed(rows: string[]): string {
  return `<section>...graph...</section>
  <section><table class="table-stats events"><tbody>${rows.join("")}</tbody></table></section>`;
}

describe("parseLiveMatchFeedHtml", () => {
  it("feed vide (match pas commencé) → null", () => {
    expect(parseLiveMatchFeedHtml("<section><table class='table-stats events'><tbody></tbody></table></section>")).toBeNull();
    expect(parseLiveMatchFeedHtml("<div>rien</div>")).toBeNull();
  });

  it("1ère mi-temps en cours", () => {
    const s = parseLiveMatchFeedHtml(
      feed([
        row({ icon: "goals", min: "18:20", home: 9, away: 7, event: "But de X (Limoges)" }),
        row({ icon: "goals_7m", min: "01:02", home: 1, away: 0, event: "Penalty réussi de Y (Limoges)" }),
      ])
    );
    expect(s).toMatchObject({ homeScore: 9, awayScore: 7, minute: 18, period: "1H", finished: false });
  });

  it("mi-temps (dernier événement = fin de la première mi-temps)", () => {
    const s = parseLiveMatchFeedHtml(
      feed([
        row({ icon: "periods_finish", min: "30:00", home: 15, away: 14, event: "Fin de la première mi-temps" }),
        row({ icon: "goals", min: "29:40", home: 15, away: 14, event: "But de X" }),
      ])
    );
    expect(s).toMatchObject({ period: "HT", minute: 30, finished: false, homeScore: 15, awayScore: 14 });
  });

  it("2ème mi-temps : minute cumulée = 30 + minute de période", () => {
    const s = parseLiveMatchFeedHtml(
      feed([
        row({ icon: "goals", min: "12:05", home: 22, away: 20, event: "But de X" }),
        row({ icon: "periods_finish", min: "30:00", home: 15, away: 14, event: "Fin de la première mi-temps" }),
        row({ icon: "goals", min: "01:00", home: 1, away: 0, event: "But" }),
      ])
    );
    expect(s).toMatchObject({ period: "2H", minute: 42, finished: false, homeScore: 22, awayScore: 20 });
  });

  it("fin du match → FT, minute 60, finished", () => {
    const s = parseLiveMatchFeedHtml(
      feed([
        row({ icon: "periods_finish", min: "30:00", home: 28, away: 30, event: "Fin du match" }),
        row({ icon: "goals_7m", min: "29:48", home: 28, away: 30, event: "Penalty réussi de Noé Thuillier (Limoges)" }),
        row({ icon: "periods_finish", min: "30:00", home: 15, away: 16, event: "Fin de la première mi-temps" }),
      ])
    );
    expect(s).toMatchObject({ period: "FT", minute: 60, finished: true, homeScore: 28, awayScore: 30 });
    expect(s?.lastEvent).toBe("Fin du match");
    expect(s?.eventCount).toBe(3);
  });
});

// Structure fidèle au HTML réel capturé en direct le 2026-09-11
// (eStatsChannels/index_ajax, Saint-Raphaël-Dunkerque, `view_tab_live` étant resté
// vide malgré le match bien en cours — voir lnh-scraper.provider.ts).
function indexItem(opts: { id: string; period: string; home: number; away: number; homeName: string; awayName: string }): string {
  return `
  <div class="calendars-listing-item listing-item live  lmsl"
    id="${opts.id}">
    <div class="row">
        <div class="col-infos">
            <div class="col-competitions">
                <span class="competition">
                    Daikin StarLigue - J02                </span>
                <br>
                ${opts.period}            </div>
        </div>
    </div>
    <div class="row">
        <div class="col-teams">
            <div class="teams-logos">
                <div class="team-logo">
                    <div class="team-name">${opts.homeName}</div>
                </div>
                <div class="scores is-live">
                    ${opts.home} - ${opts.away}                </div>
                <div class="team-logo">
                    <div class="team-name">${opts.awayName}</div>
                </div>
            </div>
        </div>
    </div>
  </div>`;
}

function upcomingItem(id: string, dateLabel: string, homeName: string, awayName: string): string {
  return `
  <div class="calendars-listing-item listing-item"
    id="${id}">
    <div class="row">
        <div class="col-infos">
            <div class="col-competitions">
                <span class="competition">
                    Daikin StarLigue - J02                </span>
                <br>
                ${dateLabel}            </div>
        </div>
    </div>
    <div class="row">
        <div class="col-teams">
            <div class="teams-logos">
                <div class="team-logo">
                    <div class="team-name">${homeName}</div>
                </div>
                <div class="team-logo">
                    <div class="team-name">${awayName}</div>
                </div>
            </div>
        </div>
    </div>
  </div>`;
}

describe("parseLiveIndexHtml", () => {
  it("match en 1ère mi-temps", () => {
    const html = indexItem({ id: "12012", period: "1ère mi-temps&nbsp;&nbsp;19:17", home: 7, away: 5, homeName: "Saint-Raphaël", awayName: "Dunkerque" });
    expect(parseLiveIndexHtml(html)).toEqual([
      { calendarsId: "12012", homeScore: 7, awayScore: 5, minute: 19, period: "1H" },
    ]);
  });

  it("mi-temps (pause)", () => {
    const html = indexItem({ id: "12012", period: "Mi-temps", home: 15, away: 14, homeName: "Saint-Raphaël", awayName: "Dunkerque" });
    expect(parseLiveIndexHtml(html)).toEqual([
      { calendarsId: "12012", homeScore: 15, awayScore: 14, minute: 30, period: "HT" },
    ]);
  });

  it("2ème mi-temps : minute cumulée = 30 + minute de période", () => {
    const html = indexItem({ id: "12012", period: "2ème mi-temps&nbsp;&nbsp;12:05", home: 22, away: 20, homeName: "Saint-Raphaël", awayName: "Dunkerque" });
    expect(parseLiveIndexHtml(html)).toEqual([
      { calendarsId: "12012", homeScore: 22, awayScore: 20, minute: 42, period: "2H" },
    ]);
  });

  it("match pas encore commencé (date affichée au lieu d'une période) → ignoré", () => {
    const html = upcomingItem("12017", "sam. 12 sept. 19h00", "Nantes", "Aix");
    expect(parseLiveIndexHtml(html)).toEqual([]);
  });

  it("plusieurs matchs : ne garde que ceux effectivement en cours", () => {
    const html =
      indexItem({ id: "12012", period: "1ère mi-temps&nbsp;&nbsp;19:17", home: 7, away: 5, homeName: "Saint-Raphaël", awayName: "Dunkerque" }) +
      indexItem({ id: "12015", period: "1ère mi-temps&nbsp;&nbsp;00:00", home: 0, away: 0, homeName: "Chartres", awayName: "Tremblay" }) +
      upcomingItem("12017", "sam. 12 sept. 19h00", "Nantes", "Aix");
    const result = parseLiveIndexHtml(html);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.calendarsId)).toEqual(["12012", "12015"]);
  });
});
