import { describe, it, expect } from "vitest";
import { classifyNewsCategory } from "./classify";

describe("classifyNewsCategory", () => {
  it("tags a signing announcement as TRANSFER", () => {
    expect(classifyNewsCategory("Karabatic signe à Montpellier", null)).toBe("TRANSFER");
  });

  it("tags a contract extension as TRANSFER", () => {
    expect(classifyNewsCategory("Le club annonce la prolongation de son gardien", null)).toBe("TRANSFER");
  });

  it("matches accented keywords in their unaccented form", () => {
    expect(classifyNewsCategory("Le joueur rejoint le club", null)).toBe("TRANSFER");
    expect(classifyNewsCategory("Nouvelle recrue au poste de pivot", null)).toBe("TRANSFER");
  });

  it("matches keywords found only in the excerpt", () => {
    expect(classifyNewsCategory("Un nouveau visage au club", "Il quitte son ancien club pour nous rejoindre")).toBe(
      "TRANSFER"
    );
  });

  it("falls back to GENERAL when no transfer keyword is present", () => {
    expect(classifyNewsCategory("Victoire à domicile face à Nantes", "32-29, une belle soirée")).toBe("GENERAL");
  });

  it("does not false-positive on unrelated words containing similar substrings", () => {
    expect(classifyNewsCategory("Le classement de la journée 12", null)).toBe("GENERAL");
  });
});
