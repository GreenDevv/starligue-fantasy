import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseClubFromHtml,
  parseClubSitemapUrls,
  parseClubSlugs,
  decodeHtmlAttribute,
  mapWithConcurrency,
} from "./ffhandball-clubs.provider";
import { IngestionError } from "./lnh-scraper.provider";

const fixture = (name: string) => readFileSync(join(__dirname, "__fixtures__", name), "utf8");

// Fixtures = fiches réelles capturées sur monclub.ffhandball.fr le 2026-08-30
// (réduites à l'élément `<div … attributes="{…}">` qui porte le blob JSON).
describe("parseClubFromHtml", () => {
  it("extrait un club standard (Angers, email = nº d'affiliation)", () => {
    const club = parseClubFromHtml(fixture("ffhandball-club-angers.html"), "angers-lac-de-maine-handball");
    expect(club).toEqual({
      ffhandballId: "6249056",
      ffhandballHash: "f7758fd141423881bcbe9b3f3e0aa809",
      name: "ANGERS LAC DE MAINE HANDBALL",
      slug: "angers-lac-de-maine-handball",
      address: "104 rue de la chambre aux deniers",
      zipcode: "49000",
      city: "ANGERS",
      latitude: 47.46848,
      longitude: -0.60708,
      website: "https://www.angerslacdemaine-handball.fr",
      facebook: "https://www.facebook.com/angerslacdemainehandball",
      instagram: "alm_handball",
    });
  });

  it("extrait un club avec ville arrondissement + IG en URL (Paris SC)", () => {
    const club = parseClubFromHtml(fixture("ffhandball-club-paris.html"), "paris-sport-club");
    expect(club.ffhandballId).toBe("5875056");
    expect(club.name).toBe("PARIS SPORT CLUB");
    expect(club.city).toBe("PARIS 20e");
    expect(club.zipcode).toBe("75020");
    expect(club.latitude).toBeCloseTo(48.8625, 4);
    expect(club.instagram).toBe("https://www.instagram.com/paris_sport_club/");
  });

  it("lève une IngestionError récupérable si le bloc club est absent", () => {
    expect(() => parseClubFromHtml("<html><body>page vide</body></html>", "x")).toThrow(IngestionError);
    try {
      parseClubFromHtml("<html></html>", "x");
    } catch (e) {
      expect((e as IngestionError).recoverable).toBe(true);
    }
  });

  it("lève une IngestionError si le blob n'est pas du JSON", () => {
    const html = '<div attributes="{&quot;club_hash&quot;:pas-du-json}"></div>';
    expect(() => parseClubFromHtml(html, "x")).toThrow(/JSON illisible/);
  });
});

describe("decodeHtmlAttribute", () => {
  it("décode les entités produites par esc_attr()", () => {
    expect(decodeHtmlAttribute("{&quot;a&quot;:&quot;b &amp; c&quot;}")).toBe('{"a":"b & c"}');
    expect(decodeHtmlAttribute("d&#039;Oise &lt;x&gt;")).toBe("d'Oise <x>");
  });
});

describe("parseClubSitemapUrls", () => {
  it("ne garde que les sous-sitemaps 'clubs' de l'index", () => {
    const urls = parseClubSitemapUrls(fixture("ffhandball-sitemap-index.xml"));
    expect(urls).toEqual([
      "https://monclub.ffhandball.fr/smartfire-clubs-sitemap.xml",
      "https://monclub.ffhandball.fr/smartfire-clubs-sitemap2.xml",
      "https://monclub.ffhandball.fr/smartfire-clubs-sitemap3.xml",
    ]);
  });
});

describe("parseClubSlugs", () => {
  it("extrait les slugs /clubs/<slug>/ d'un sous-sitemap et dédoublonne", () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://monclub.ffhandball.fr/clubs/hbc-bazadais/</loc></url>
      <url><loc>https://monclub.ffhandball.fr/clubs/angers-lac-de-maine-handball/</loc></url>
      <url><loc>https://monclub.ffhandball.fr/clubs/hbc-bazadais/</loc></url>
      <url><loc>https://monclub.ffhandball.fr/comites/comite-33/</loc></url>
    </urlset>`;
    expect(parseClubSlugs(xml)).toEqual(["hbc-bazadais", "angers-lac-de-maine-handball"]);
  });
});

describe("mapWithConcurrency", () => {
  it("préserve l'ordre et borne le parallélisme", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});
