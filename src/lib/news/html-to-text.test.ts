import { describe, it, expect } from "vitest";
import { htmlToParagraphs, htmlToPlainContent } from "./html-to-text";

describe("htmlToParagraphs", () => {
  it("extracts text from paragraph tags, decoding entities", () => {
    const html = "<p>Le club est heureux d&#8217;annoncer la signature.</p><p>Bienvenue !</p>";
    expect(htmlToParagraphs(html)).toEqual([
      "Le club est heureux d’annoncer la signature.",
      "Bienvenue !",
    ]);
  });

  it("strips inline tags (strong/em) but keeps the text", () => {
    const html = "<p>Un <strong>arrière gauche</strong> de <em>27 ans</em>.</p>";
    expect(htmlToParagraphs(html)).toEqual(["Un arrière gauche de 27 ans."]);
  });

  it("includes list items and headings as separate paragraphs", () => {
    const html = "<h3>Biographie</h3><ul><li>Nom : Test</li><li>Âge : 27 ans</li></ul>";
    expect(htmlToParagraphs(html)).toEqual(["Biographie", "Nom : Test", "Âge : 27 ans"]);
  });

  it("skips empty paragraphs (whitespace-only, common WordPress spacer blocks)", () => {
    const html = "<p>Vrai contenu.</p><p> </p><p>&nbsp;</p>";
    expect(htmlToParagraphs(html)).toEqual(["Vrai contenu."]);
  });

  it("drops the WordPress feed-syndication attribution boilerplate", () => {
    const html =
      "<p>Vrai contenu de l'article.</p><p>L’article Pau Oliveras signe est apparu en premier sur Istres Provence Handball.</p>";
    expect(htmlToParagraphs(html)).toEqual(["Vrai contenu de l'article."]);
  });

  it("returns an empty array for HTML with no block-level content", () => {
    expect(htmlToParagraphs("<div><img src=\"x.jpg\"></div>")).toEqual([]);
  });
});

describe("htmlToPlainContent", () => {
  it("joins paragraphs with double newlines", () => {
    const html = "<p>Un.</p><p>Deux.</p>";
    expect(htmlToPlainContent(html)).toBe("Un.\n\nDeux.");
  });

  it("returns null when there is no extractable content", () => {
    expect(htmlToPlainContent("<div>rien</div>")).toBeNull();
  });
});
