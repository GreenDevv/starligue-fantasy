import { describe, it, expect } from "vitest";
import { searchCities, geocodeCity } from "./cities";

// Teste contre le snapshot GeoNames réellement embarqué (src/lib/geo/data).

describe("searchCities", () => {
  it("trouve New York City et renvoie ses coordonnées", () => {
    const hits = searchCities("new york city", { country: "US" });
    const nyc = hits.find((c) => c.name === "New York City");
    expect(nyc).toBeDefined();
    expect(nyc!.latitude).toBeCloseTo(40.71, 1);
    expect(nyc!.longitude).toBeCloseTo(-74.01, 1);
    expect(nyc!.country).toBe("US");
  });

  it("ignore les accents et la casse", () => {
    const hits = searchCities("montreal", { country: "CA" });
    expect(hits.some((c) => c.name === "Montréal")).toBe(true);
  });

  it("filtre par pays", () => {
    const hits = searchCities("paris", { country: "FR", limit: 5 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((c) => c.country === "FR")).toBe(true);
    expect(hits[0]?.name).toBe("Paris");
  });

  it("renvoie [] pour une requête trop courte", () => {
    expect(searchCities("p")).toEqual([]);
  });

  it("respecte la limite", () => {
    expect(searchCities("san", { limit: 3 }).length).toBeLessThanOrEqual(3);
  });
});

describe("geocodeCity", () => {
  it("résout une ville exacte dans un pays", () => {
    const c = geocodeCity("New York City", "US");
    expect(c).not.toBeNull();
    expect(c!.latitude).toBeCloseTo(40.71, 1);
  });

  it("résout en ignorant les accents", () => {
    expect(geocodeCity("montreal", "CA")).not.toBeNull();
  });

  it("renvoie null si la ville n'existe pas dans ce pays", () => {
    expect(geocodeCity("Trifouillis-les-Oies", "FR")).toBeNull();
    expect(geocodeCity("New York City", "FR")).toBeNull();
  });
});
