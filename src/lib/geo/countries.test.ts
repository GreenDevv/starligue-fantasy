import { describe, it, expect } from "vitest";
import { COUNTRY_CODES, isCountryCode, countryFlag, countryName, countryOptions } from "./countries";

describe("countries", () => {
  it("reconnaît un code valide et rejette le reste", () => {
    expect(isCountryCode("FR")).toBe(true);
    expect(isCountryCode("DE")).toBe(true);
    expect(isCountryCode("XX")).toBe(false);
    expect(isCountryCode("fr")).toBe(false); // sensible à la casse — l'API stocke en majuscules
    expect(isCountryCode("")).toBe(false);
  });

  it("dérive le drapeau emoji depuis le code", () => {
    expect(countryFlag("FR")).toBe("🇫🇷");
    expect(countryFlag("de")).toBe("🇩🇪"); // tolère les minuscules
    expect(countryFlag("ZZZ")).toBe("");
    expect(countryFlag("1")).toBe("");
  });

  it("localise le nom de pays via Intl", () => {
    expect(countryName("FR", "fr")).toBe("France");
    expect(countryName("DE", "fr")).toBe("Allemagne");
    expect(countryName("DE", "en")).toBe("Germany");
  });

  it("ne renvoie jamais de doublon de code", () => {
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length);
  });

  it("épingle la France en tête des options", () => {
    const opts = countryOptions("fr");
    expect(opts[0]?.code).toBe("FR");
    expect(opts).toHaveLength(COUNTRY_CODES.length);
  });
});
