import { describe, it, expect } from "vitest";
import {
  makeFranceProjector,
  isInMetropolitanFrance,
  METRO_FRANCE_RING,
  CORSICA_RING,
} from "./france-map";

describe("makeFranceProjector", () => {
  const p = makeFranceProjector(300, 300);

  it("garde tous les points du contour dans le cadre", () => {
    for (const [lon, lat] of [...METRO_FRANCE_RING, ...CORSICA_RING]) {
      const { x, y } = p.project(lon, lat);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(300);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(300);
    }
  });

  it("place les villes connues cohéremment les unes par rapport aux autres", () => {
    const lille = p.project(3.06, 50.63);
    const marseille = p.project(5.37, 43.3);
    const brest = p.project(-4.49, 48.39);
    const strasbourg = p.project(7.75, 48.57);

    // Lille au nord de Marseille
    expect(lille.y).toBeLessThan(marseille.y);
    // Brest à l'ouest de Strasbourg
    expect(brest.x).toBeLessThan(strasbourg.x);
    // Marseille au sud de Strasbourg
    expect(marseille.y).toBeGreaterThan(strasbourg.y);
  });

  it("produit un path SVG fermé", () => {
    const d = p.ringPath(CORSICA_RING);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });
});

describe("isInMetropolitanFrance", () => {
  it("accepte la métropole et la Corse, rejette DROM et étranger", () => {
    expect(isInMetropolitanFrance(2.35, 48.85)).toBe(true); // Paris
    expect(isInMetropolitanFrance(9.15, 41.93)).toBe(true); // Ajaccio
    expect(isInMetropolitanFrance(-61.55, 16.24)).toBe(false); // Guadeloupe
    expect(isInMetropolitanFrance(55.45, -20.88)).toBe(false); // La Réunion
    expect(isInMetropolitanFrance(13.4, 52.5)).toBe(false); // Berlin
  });
});
