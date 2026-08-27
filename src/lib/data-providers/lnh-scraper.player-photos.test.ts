import { describe, it, expect } from "vitest";
import { parsePlayerPhotosFromHtml } from "./lnh-scraper.provider";

// Fragment fidèle à la structure réelle capturée sur daikin-starligue/joueurs
// (contents_controller=sportsPlayers, action=index_ajax) — vérifié le 2026-08-27.
// Contrairement à parseRosterFromHtml (page club), la photo est en fond CSS
// (col-picture), pas une balise <img>.
function item(opts: {
  href: string;
  name: string; // "Prenom NOM" — le nom de famille = suffixe en majuscules
  description: string;
  teamSlug: string;
  teamName: string;
  photoFile: string; // ex: "small_abdi-ayyoub__picture__2026-2027-2846-17829.png" ou "small_silhouette.png"
}): string {
  return `
<a class="players-listing-item listing-item " href="https://www.lnh.fr/daikin-starligue/joueurs/${opts.href}">
    <div class="row-picture">
        <div class="col-picture" style="background: url(https://www.lnh.fr/medias/sports_players/${opts.photoFile}) no-repeat top center; background-size: cover;">
        </div>
        <div class="col-infos">
            <img src="https://www.lnh.fr/medias/sports_teams/${opts.teamSlug}__logo__2026-2027.png" alt="équipe ${opts.teamName}" />
            <div class="number">
                #18            </div>
        </div>
    </div>
    <div class="row-name">
        <div class="name">
            ${opts.name}
        </div>
        <div class="description">
            ${opts.description}        </div>
            </div>
    <div class="more">
        <i class="fa-solid fa-plus"></i>
    </div>
</a>`;
}

describe("parsePlayerPhotosFromHtml", () => {
  it("extracts firstName/lastName, club slug and photo URL for a player with a real photo", () => {
    const html = item({
      href: "ayoub-abdi",
      name: "Ayoub ABDI",
      description: "Arrière Droit",
      teamSlug: "nantes",
      teamName: "Nantes",
      photoFile: "small_abdi-ayyoub__picture__2026-2027-2846-17829.png",
    });
    const rows = parsePlayerPhotosFromHtml(html);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      firstName: "Ayoub",
      lastName: "ABDI",
      lnhClubSlug: "nantes",
      photoUrl: "https://www.lnh.fr/medias/sports_players/small_abdi-ayyoub__picture__2026-2027-2846-17829.png",
    });
  });

  it("returns photoUrl null for a player who still only has the generic silhouette", () => {
    const html = item({
      href: "owen-abodogo",
      name: "Owen ABODOGO",
      description: "Pivot",
      teamSlug: "caen",
      teamName: "Caen",
      photoFile: "small_silhouette.png",
    });
    const rows = parsePlayerPhotosFromHtml(html);
    expect(rows[0]).toMatchObject({ photoUrl: null });
  });

  it("handles a hyphenated first name (suffix-of-uppercase-tokens split still works)", () => {
    const html = item({
      href: "jean-jacques-acquevillo",
      name: "Jean-jacques ACQUEVILLO",
      description: "Ailier Droit",
      teamSlug: "nimes",
      teamName: "Nîmes",
      photoFile: "small_acquevillo-jean-jacques__picture__2026-2027-2867-17856.png",
    });
    const rows = parsePlayerPhotosFromHtml(html);
    expect(rows[0]).toMatchObject({ firstName: "Jean-jacques", lastName: "ACQUEVILLO" });
  });

  it("parses multiple items in one response", () => {
    const html = [
      item({ href: "a", name: "Valentin AMAN", description: "Gardien", teamSlug: "limoges", teamName: "Limoges", photoFile: "small_a.png" }),
      item({ href: "b", name: "Arthur ANQUETIL", description: "Pivot", teamSlug: "psg", teamName: "Paris", photoFile: "small_silhouette.png" }),
    ].join("\n");
    const rows = parsePlayerPhotosFromHtml(html);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.lastName)).toEqual(["AMAN", "ANQUETIL"]);
  });

  it("returns an empty array for a page with no player items", () => {
    expect(parsePlayerPhotosFromHtml("<div>rien</div>")).toEqual([]);
  });
});
