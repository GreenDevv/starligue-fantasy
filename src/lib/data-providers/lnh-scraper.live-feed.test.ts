import { describe, it, expect } from "vitest";
import { parseLiveMatchFeedHtml } from "./lnh-scraper.provider";

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
