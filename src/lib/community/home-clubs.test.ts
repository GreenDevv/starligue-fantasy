import { describe, it, expect } from "vitest";
import { aggregateHomeClubs, departmentFromZipcode, type HomeClubMemberRow } from "./home-clubs";

const row = (o: Partial<HomeClubMemberRow>): HomeClubMemberRow => ({
  clubId: "c",
  country: "FR",
  zipcode: "75001",
  latitude: 48.86,
  longitude: 2.35,
  ...o,
});

describe("departmentFromZipcode", () => {
  it("extrait les 2 premiers chiffres, rejette DROM et invalides", () => {
    expect(departmentFromZipcode("49000")).toBe("49");
    expect(departmentFromZipcode("06200")).toBe("06");
    expect(departmentFromZipcode("97400")).toBe(null); // La Réunion
    expect(departmentFromZipcode("abc")).toBe(null);
    expect(departmentFromZipcode(null)).toBe(null);
  });
});

describe("aggregateHomeClubs", () => {
  it("groupe les membres métropolitains par département avec position moyenne", () => {
    const agg = aggregateHomeClubs([
      row({ clubId: "a", zipcode: "49000", latitude: 47.47, longitude: -0.55 }),
      row({ clubId: "b", zipcode: "49100", latitude: 47.47, longitude: -0.57 }),
      row({ clubId: "c", zipcode: "75001", latitude: 48.86, longitude: 2.35 }),
    ]);
    expect(agg.totals).toEqual({ members: 3, clubs: 3, departments: 2 });
    const dept49 = agg.metropolitan.find((d) => d.dept === "49");
    expect(dept49?.count).toBe(2);
    expect(dept49?.lon).toBeCloseTo(-0.56, 2);
    // trié par count décroissant
    expect(agg.metropolitan[0]?.dept).toBe("49");
  });

  it("compte plusieurs membres d'un même club (clubs distincts != membres)", () => {
    const agg = aggregateHomeClubs([row({ clubId: "x" }), row({ clubId: "x" }), row({ clubId: "y" })]);
    expect(agg.totals.members).toBe(3);
    expect(agg.totals.clubs).toBe(2);
  });

  it("range l'étranger et l'outre-mer dans abroad, trié par count", () => {
    const agg = aggregateHomeClubs([
      row({ clubId: "d", country: "DE", zipcode: null, latitude: 52.5, longitude: 13.4 }),
      row({ clubId: "e", country: "DE", zipcode: null, latitude: 50.9, longitude: 6.9 }),
      row({ clubId: "g", country: "FR", zipcode: "97110", latitude: 16.24, longitude: -61.53 }),
    ]);
    expect(agg.abroad).toEqual([
      { key: "DE", count: 2 },
      { key: "OUTRE_MER", count: 1 },
    ]);
    expect(agg.metropolitan).toHaveLength(0);
  });

  it("compte les membres FR sans coordonnées comme non localisés", () => {
    const agg = aggregateHomeClubs([row({ clubId: "z", latitude: null, longitude: null, zipcode: "31000" })]);
    expect(agg.unlocated).toBe(1);
    expect(agg.metropolitan).toHaveLength(0);
    expect(agg.totals.members).toBe(1);
  });
});
