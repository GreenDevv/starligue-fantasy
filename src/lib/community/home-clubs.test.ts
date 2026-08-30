import { describe, it, expect } from "vitest";
import {
  aggregateHomeClubs,
  departmentFromZipcode,
  groupOverseasByCountry,
  type HomeClubMemberRow,
} from "./home-clubs";

const row = (o: Partial<HomeClubMemberRow>): HomeClubMemberRow => ({
  clubId: "c",
  clubName: "Club C",
  clubCity: "Ville C",
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

  it("détaille les clubs derrière chaque point de département (survol de la carte)", () => {
    const agg = aggregateHomeClubs([
      row({ clubId: "a", clubName: "Angers SCO HB", zipcode: "49000", latitude: 47.47, longitude: -0.55 }),
      row({ clubId: "a", clubName: "Angers SCO HB", zipcode: "49000", latitude: 47.47, longitude: -0.55 }),
      row({ clubId: "b", clubName: "Cholet HB", zipcode: "49300", latitude: 47.06, longitude: -0.88 }),
    ]);
    const dept49 = agg.metropolitan.find((d) => d.dept === "49");
    expect(dept49?.clubs).toEqual([
      { name: "Angers SCO HB", city: "Ville C", count: 2 },
      { name: "Cholet HB", city: "Ville C", count: 1 },
    ]);
  });

  it("compte plusieurs membres d'un même club (clubs distincts != membres)", () => {
    const agg = aggregateHomeClubs([row({ clubId: "x" }), row({ clubId: "x" }), row({ clubId: "y" })]);
    expect(agg.totals.members).toBe(3);
    expect(agg.totals.clubs).toBe(2);
  });

  it("place les clubs hors métropole (étranger, DROM) comme points individuels", () => {
    const agg = aggregateHomeClubs([
      row({ clubId: "nyc", clubName: "NYC THC", clubCity: "New York City", country: "US", zipcode: null, latitude: 40.71, longitude: -74.01 }),
      row({ clubId: "nyc", clubName: "NYC THC", clubCity: "New York City", country: "US", zipcode: null, latitude: 40.71, longitude: -74.01 }),
      row({ clubId: "gp", clubName: "Gosier HB", clubCity: "Le Gosier", country: "FR", zipcode: "97190", latitude: 16.2, longitude: -61.5 }),
    ]);
    expect(agg.metropolitan).toHaveLength(0);
    expect(agg.overseas).toEqual([
      { clubId: "nyc", name: "NYC THC", city: "New York City", country: "US", lon: -74.01, lat: 40.71, count: 2 },
      { clubId: "gp", name: "Gosier HB", city: "Le Gosier", country: "FR", lon: -61.5, lat: 16.2, count: 1 },
    ]);
    expect(agg.totals).toEqual({ members: 3, clubs: 2, departments: 0 });
  });

  it("compte les membres dont le club n'a aucune coordonnée comme non localisés", () => {
    const agg = aggregateHomeClubs([
      row({ clubId: "z", latitude: null, longitude: null, zipcode: "31000" }),
      row({ clubId: "w", country: "BE", latitude: null, longitude: null, zipcode: null }),
    ]);
    expect(agg.unlocated).toBe(2);
    expect(agg.metropolitan).toHaveLength(0);
    expect(agg.overseas).toHaveLength(0);
    expect(agg.totals.members).toBe(2);
  });
});

describe("groupOverseasByCountry", () => {
  it("regroupe et trie les points hors métropole par pays", () => {
    const agg = aggregateHomeClubs([
      row({ clubId: "a", country: "DE", zipcode: null, latitude: 52.5, longitude: 13.4 }),
      row({ clubId: "b", country: "DE", zipcode: null, latitude: 50.9, longitude: 6.9 }),
      row({ clubId: "c", country: "CH", zipcode: null, latitude: 46.2, longitude: 6.1 }),
    ]);
    expect(groupOverseasByCountry(agg.overseas)).toEqual([
      { country: "DE", count: 2 },
      { country: "CH", count: 1 },
    ]);
  });
});
