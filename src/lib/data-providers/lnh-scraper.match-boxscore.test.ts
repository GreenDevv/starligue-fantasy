import { describe, it, expect } from "vitest";
import { parseMatchBoxscoreHtml } from "./lnh-scraper.provider";

// Fragment fidèle à la structure réelle capturée sur
// daikin-starligue/calendriers/20252026/lsl/j30/montpellier/nimes (onglet
// view_tab_stats, contents_controller=sportsCalendars) — vérifié le 2026-07-15 :
// team-header (domicile) / team-header away (extérieur), une ou plusieurs
// <table class="table-stats"> par équipe, colonnes reconnues par libellé d'en-tête.
function tableFor(rows: Array<{ name: string; score: string; temps: string }>): string {
  const rowsHtml = rows
    .map(
      (r) => `
    <tr class="">
      <td class="first-cell sticky-cell cell-info">
        <div class="cell-player">
          <div class="num">4</div>
          <div class="name">
            <a href="lnh/joueurs/x">${r.name}</a>
          </div>
        </div>
      </td>
      <td>3 / 4</td>
      <td>0 / 1</td>
      <td><span class="top-stats">3 / 5</span></td>
      <td>60,00 <span class="percent">%</span></td>
      <td>5</td>
      <td>0</td>
      <td>0</td>
      <td>0</td>
      <td>0</td>
      <td>0</td>
      <td>0</td>
      <td>0</td>
      <td>0</td>
      <td>NON</td>
      <td>${r.score}</td>
      <td>${r.temps}</td>
    </tr>`
    )
    .join("");

  return `
    <table class="table-stats">
      <thead>
        <tr class="sticky-header">
          <th class="first-cell sticky-cell"><div class="thead-inside">joueurs</div></th>
          <th><div class="thead-inside">buts<br />tirs</div></th>
          <th><div class="thead-inside">buts<br />penalty</div></th>
          <th><div class="thead-inside">total<br />buts</div></th>
          <th><div class="thead-inside">%<br />tirs</div></th>
          <th><div class="thead-inside">dernière<br />passe</div></th>
          <th><div class="thead-inside">ballons<br>récupérés *</div></th>
          <th><div class="thead-inside">tirs adverses<br> contrés</div></th>
          <th><div class="thead-inside">penaltys<br> provoqués</div></th>
          <th><div class="thead-inside">2 min<br>provoquées</div></th>
          <th><div class="thead-inside">neutralisations</div></th>
          <th><div class="thead-inside">pertes<br>balles</div></th>
          <th><div class="thead-inside">avert.</div></th>
          <th><div class="thead-inside">2 min</div></th>
          <th><div class="thead-inside">disq.</div></th>
          <th><div class="thead-inside">score<br>LNH</div></th>
          <th><div class="thead-inside">Temps jeu</div></th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;
}

// Fragment fidèle au tableau gardiens réel (capturé le 2026-07-23 sur
// daikin-starligue/calendriers/20252026/lsl/j30/montpellier/nimes) : colonnes
// "arrêts tirs"/"arrêts penalty"/"total arrêts"/"% tirs" (= % d'arrêts ici, pas %
// de réussite au tir)/"buts"/"% réussite"/"dernière passe"/"ballons récupérés"/
// "2 min provoquées"/"pertes balles"/"avert."/"2 min"/"disq."/"score LNH"/"Temps jeu"
// — pas de "buts tirs"/"tirs adverses contrés"/"penaltys provoqués"/"neutralisations".
function goalkeeperTableFor(rows: Array<{ name: string; score: string; temps: string }>): string {
  const rowsHtml = rows
    .map(
      (r) => `
    <tr class="">
      <td class="first-cell sticky-cell cell-info">
        <div class="cell-player">
          <div class="num">12</div>
          <div class="name">
            <a href="lnh/joueurs/x">${r.name}</a>
          </div>
        </div>
      </td>
      <td>13 / 38</td>
      <td>0 / 3</td>
      <td><span class="top-stats">13 / 41</span></td>
      <td>31,71 <span class="percent">%</span></td>
      <td>0 / 0</td>
      <td>0,00 <span class="percent">%</span></td>
      <td>1</td>
      <td>0</td>
      <td>0</td>
      <td>1</td>
      <td>0</td>
      <td>0</td>
      <td>NON</td>
      <td>${r.score}</td>
      <td>${r.temps}</td>
    </tr>`
    )
    .join("");

  return `
    <table class="table-stats">
      <thead>
        <tr class="sticky-header">
          <th class="first-cell sticky-cell"><div class="thead-inside">gardiens</div></th>
          <th><div class="thead-inside">arrêts<br />tirs</div></th>
          <th><div class="thead-inside">arrêts<br />penalty</div></th>
          <th><div class="thead-inside">total<br />arrêts</div></th>
          <th><div class="thead-inside">%<br />tirs</div></th>
          <th><div class="thead-inside">buts</div></th>
          <th><div class="thead-inside">% réussite</div></th>
          <th><div class="thead-inside">dernière<br />passe</div></th>
          <th><div class="thead-inside">ballons<br>récupérés *</div></th>
          <th><div class="thead-inside">2 min<br>provoquées</div></th>
          <th><div class="thead-inside">pertes<br>balles</div></th>
          <th><div class="thead-inside">avert.</div></th>
          <th><div class="thead-inside">2 min</div></th>
          <th><div class="thead-inside">disq.</div></th>
          <th><div class="thead-inside">score<br>LNH</div></th>
          <th><div class="thead-inside">Temps jeu</div></th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;
}

const GOALKEEPER_ROW_STATS = {
  saves: 13,
  shotsFaced: 41,
  savePercentage: 31.71,
  goalsPlay: null,
  shotsPlay: null,
  goalsPenalty: null,
  shotsPenalty: null,
  goalsTotal: null,
  shotsTotal: null,
  shotPercentage: null,
  assists: 1,
  ballsRecovered: 0,
  opponentShotsBlocked: null,
  penaltiesDrawn: null,
  twoMinDrawn: 0,
  neutralizations: null,
  turnovers: 1,
  twoMinTaken: 0,
  disqualified: 0,
};

function boxscorePage(): string {
  return `
    <div class="team-header">
      <div class="logo"><img src="https://www.lnh.fr/medias/sports_teams/montpellier__logo__2024-2025.png"></div>
      <div class="name">Montpellier</div>
    </div>
    ${tableFor([
      { name: "SIMONET Diego", score: "9.8", temps: "11:53" },
      { name: "VILLEMINOT Kyllian", score: "23.8", temps: "33:29" },
    ])}
    <div class="team-header away">
      <div class="logo"><img src="https://www.lnh.fr/medias/sports_teams/nimes__logo__2025-2026.png"></div>
      <div class="name">Nîmes</div>
    </div>
    ${tableFor([
      { name: "FAUSTIN Jean-loup", score: "12.4", temps: "40:00" },
      { name: "BANC Joueur", score: "0", temps: "00:00" },
    ])}`;
}

// Stats détaillées communes à toutes les lignes générées par tableFor() ci-dessus
// (buts tirs "3/4", buts penalty "0/1", total buts "3/5", % tirs "60,00 %", dernière
// passe "5", tout le reste à "0", disq. "NON"). Tableau joueurs de champ : pas de
// colonne "total arrêts" → saves/shotsFaced/savePercentage toujours null.
const ROW_STATS = {
  saves: null,
  shotsFaced: null,
  savePercentage: null,
  goalsPlay: 3,
  shotsPlay: 4,
  goalsPenalty: 0,
  shotsPenalty: 1,
  goalsTotal: 3,
  shotsTotal: 5,
  shotPercentage: 60,
  assists: 5,
  ballsRecovered: 0,
  opponentShotsBlocked: 0,
  penaltiesDrawn: 0,
  twoMinDrawn: 0,
  neutralizations: 0,
  turnovers: 0,
  twoMinTaken: 0,
  disqualified: 0,
};

describe("parseMatchBoxscoreHtml", () => {
  it("extracts per-player match scores tagged with the correct club (home vs away)", () => {
    const rows = parseMatchBoxscoreHtml(boxscorePage());
    expect(rows).toContainEqual({
      firstName: "Diego",
      lastName: "SIMONET",
      lnhClubSlug: "montpellier",
      score: 9.8,
      played: true,
      ...ROW_STATS,
    });
    expect(rows).toContainEqual({
      firstName: "Kyllian",
      lastName: "VILLEMINOT",
      lnhClubSlug: "montpellier",
      score: 23.8,
      played: true,
      ...ROW_STATS,
    });
    expect(rows).toContainEqual({
      firstName: "Jean-loup",
      lastName: "FAUSTIN",
      lnhClubSlug: "nimes",
      score: 12.4,
      played: true,
      ...ROW_STATS,
    });
  });

  it("marks a player with 00:00 playing time as not played", () => {
    const rows = parseMatchBoxscoreHtml(boxscorePage());
    const bench = rows.find((r) => r.lastName === "BANC");
    expect(bench).toEqual({
      firstName: "Joueur",
      lastName: "BANC",
      lnhClubSlug: "nimes",
      score: 0,
      played: false,
      ...ROW_STATS,
    });
  });

  it("extracts saves/shotsFaced/savePercentage from the goalkeeper table, and nulls out field-player-only stats", () => {
    const html = `
      <div class="team-header">
        <div class="logo"><img src="https://www.lnh.fr/medias/sports_teams/montpellier__logo__2024-2025.png"></div>
        <div class="name">Montpellier</div>
      </div>
      ${goalkeeperTableFor([{ name: "BOLZINGER Charles", score: "17.2", temps: "55:17" }])}`;

    const rows = parseMatchBoxscoreHtml(html);
    expect(rows).toContainEqual({
      firstName: "Charles",
      lastName: "BOLZINGER",
      lnhClubSlug: "montpellier",
      score: 17.2,
      played: true,
      ...GOALKEEPER_ROW_STATS,
    });
  });

  it("returns an empty array when there is no team-header in the page", () => {
    expect(parseMatchBoxscoreHtml("<div>no data</div>")).toEqual([]);
  });

  it("handles a page with a team-header but no score column (returns nothing for that table)", () => {
    const html = `
      <div class="team-header">
        <div class="logo"><img src="https://www.lnh.fr/medias/sports_teams/montpellier__logo__2024-2025.png"></div>
        <div class="name">Montpellier</div>
      </div>
      <table class="table-stats">
        <thead><tr><th><div class="thead-inside">joueurs</div></th></tr></thead>
        <tbody><tr class=""><td>x</td></tr></tbody>
      </table>`;
    expect(parseMatchBoxscoreHtml(html)).toEqual([]);
  });
});
