import { describe, it, expect } from "vitest";
import { parseStandingsFromHtml } from "./lnh-scraper.provider";

// Fragment fidèle à la structure réelle capturée sur daikin-starligue/classement
// (contents_controller=sportsStandings, seasons_id=39, saison 2025/2026 terminée) —
// vérifié le 2026-07-20. thead : pts, mj, vict., nul, déf., buts pour, buts contre,
// goal avg, part.pts, part.goals (les 2 dernières ignorées par le parseur, pas
// demandées par le jeu).
function row(opts: {
  rank: number;
  slug: string;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalAvg: number;
}): string {
  return `
<tr class="">
    <td class="first-cell sticky-cell">
        <div class="cell-standing">
            <div class="pos" style="background-color: #00468e; color: #FFF;">
                <span>${opts.rank}</span>
            </div>
            <div class="logo">
                <img src="https://www.lnh.fr/medias/sports_teams/${opts.slug}__logo__2025-2026.png" />
            </div>
        </div>
    </td>
    <td>
        <div class="cell-standing second">
            <div class="name">
                <a href="daikin-starligue/equipes/some-club">
                    Club                </a>
            </div>
        </div>
    </td>
                <td>
                ${opts.points}            </td>
            <td>
                ${opts.played}            </td>
            <td>
                ${opts.wins}            </td>
            <td>
                ${opts.draws}            </td>
            <td>
                ${opts.losses}            </td>

            <td>
                ${opts.goalsFor}            </td>
            <td>
                ${opts.goalsAgainst}            </td>
            <td>
                ${opts.goalAvg}            </td>
            <td>
                0.00            </td>
            <td>
                0            </td>
            </tr>`;
}

function wrapTable(rows: string): string {
  return `<div class="sticky-table"><table class="table-stats standings-table"><thead><tr class="sticky-header"></tr></thead><tbody>${rows}</tbody></table></div>`;
}

describe("parseStandingsFromHtml", () => {
  it("extracts a finished-season row with points, record, goals and goal avg", () => {
    const html = wrapTable(
      row({
        rank: 1,
        slug: "paris",
        points: 59,
        played: 30,
        wins: 29,
        draws: 1,
        losses: 0,
        goalsFor: 1041,
        goalsAgainst: 841,
        goalAvg: 200,
      })
    );

    const rows = parseStandingsFromHtml(html);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      rank: 1,
      clubSlug: "paris",
      points: 59,
      played: 30,
      wins: 29,
      draws: 1,
      losses: 0,
      goalsFor: 1041,
      goalsAgainst: 841,
      goalAvg: 200,
    });
  });

  it("keeps a negative goal avg for a relegation-zone club", () => {
    const html = wrapTable(
      row({
        rank: 16,
        slug: "dijon",
        points: 12,
        played: 30,
        wins: 5,
        draws: 2,
        losses: 23,
        goalsFor: 866,
        goalsAgainst: 969,
        goalAvg: -103,
      })
    );

    const rows = parseStandingsFromHtml(html);
    expect(rows[0]?.goalAvg).toBe(-103);
  });

  it("parses an all-zero pre-season row (no match played yet)", () => {
    const html = wrapTable(
      row({
        rank: 1,
        slug: "aix",
        points: 0,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalAvg: 0,
      })
    );

    const rows = parseStandingsFromHtml(html);
    expect(rows[0]).toMatchObject({ rank: 1, clubSlug: "aix", points: 0, played: 0 });
  });

  it("parses multiple rows in table order", () => {
    const html = wrapTable(
      row({ rank: 1, slug: "paris", points: 59, played: 30, wins: 29, draws: 1, losses: 0, goalsFor: 1041, goalsAgainst: 841, goalAvg: 200 }) +
      row({ rank: 2, slug: "nantes", points: 50, played: 30, wins: 24, draws: 2, losses: 4, goalsFor: 950, goalsAgainst: 850, goalAvg: 100 })
    );

    const rows = parseStandingsFromHtml(html);
    expect(rows.map((r) => r.clubSlug)).toEqual(["paris", "nantes"]);
  });

  it("returns an empty array when there is no tbody", () => {
    expect(parseStandingsFromHtml("<p>no table here</p>")).toEqual([]);
  });
});
