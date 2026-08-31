import { describe, it, expect } from "vitest";
import { isInMetropolitanFrance } from "./france-map";

describe("isInMetropolitanFrance", () => {
  it("accepte la métropole et la Corse, rejette DROM et étranger", () => {
    expect(isInMetropolitanFrance(2.35, 48.85)).toBe(true); // Paris
    expect(isInMetropolitanFrance(9.15, 41.93)).toBe(true); // Ajaccio
    expect(isInMetropolitanFrance(-61.55, 16.24)).toBe(false); // Guadeloupe
    expect(isInMetropolitanFrance(55.45, -20.88)).toBe(false); // La Réunion
    expect(isInMetropolitanFrance(13.4, 52.5)).toBe(false); // Berlin
  });
});
