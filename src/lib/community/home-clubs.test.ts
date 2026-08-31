import { describe, it, expect } from "vitest";
import {
  aggregateHomeClubs,
  departmentFromZipcode,
  groupOverseasByCountry,
  isOverseasPoint,
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
  it("place un point par club, avec ses coordonnées exactes", () => {
    const agg = aggregateHomeClubs([
      row({ clubId: "a", clubName: "Angers SCO HB", zipcode: "49000", latitude: 47.47, longitude: -0.55 }),
      row({ clubId: "b", clubName: "Cholet HB", zipcode: "49300", latitude: 47.06, longitude: -0.88 }),
      row({ clubId: "c", clubName: "Club C", zipcode: "75001", latitude: 48.86, longitude: 2.35 }),
    ]);
    expect(agg.totals).toEqual({ members: 3, clubs: 3, departments: 2 });
    const angers = agg.points.find((p) => p.clubId === "a");
    expect(angers).toEqual({ clubId: "a", name: "Angers SCO HB", city: "Ville C", country: "FR", lon: -0.55, lat: 47.47, count: 1 });
  });

  it("compte plusieurs membres d'un même club sur un seul point, trié par count décroissant", () => {
    const agg = aggregateHomeClubs([
      row({ clubId: "a", clubName: "Angers SCO HB", zipcode: "49000", latitude: 47.47, longitude: -0.55 }),
      row({ clubId: "a", clubName: "Angers SCO HB", zipcode: "49000", latitude: 47.47, longitude: -0.55 }),
      row({ clubId: "b", clubName: "Cholet HB", zipcode: "49300", latitude: 47.06, longitude: -0.88 }),
    ]);
    expect(agg.totals.members).toBe(3);
    expect(agg.totals.clubs).toBe(2);
    expect(agg.points[0]).toEqual({ clubId: "a", name: "Angers SCO HB", city: "Ville C", country: "FR", lon: -0.55, lat: 47.47, count: 2 });
  });

  it("compte les départements distincts en métropole (pas les points)", () => {
    const agg = aggregateHomeClubs([
      row({ clubId: "a", zipcode: "49000", latitude: 47.47, longitude: -0.55 }),
      row({ clubId: "b", zipcode: "49100", latitude: 47.47, longitude: -0.57 }),
      row({ clubId: "c", zipcode: "75001", latitude: 48.86, longitude: 2.35 }),
    ]);
    expect(agg.totals.departments).toBe(2); // 49 et 75, "a" et "b" sont bien tous deux dans le 49
  });

  it("place les clubs hors métropole (étranger, DROM) comme points individuels", () => {
    const agg = aggregateHomeClubs([
      row({ clubId: "nyc", clubName: "NYC THC", clubCity: "New York City", country: "US", zipcode: null, latitude: 40.71, longitude: -74.01 }),
      row({ clubId: "nyc", clubName: "NYC THC", clubCity: "New York City", country: "US", zipcode: null, latitude: 40.71, longitude: -74.01 }),
      row({ clubId: "gp", clubName: "Gosier HB", clubCity: "Le Gosier", country: "FR", zipcode: "97190", latitude: 16.2, longitude: -61.5 }),
    ]);
    const nyc = agg.points.find((p) => p.clubId === "nyc");
    const gosier = agg.points.find((p) => p.clubId === "gp");
    expect(nyc).toEqual({ clubId: "nyc", name: "NYC THC", city: "New York City", country: "US", lon: -74.01, lat: 40.71, count: 2 });
    expect(gosier).toEqual({ clubId: "gp", name: "Gosier HB", city: "Le Gosier", country: "FR", lon: -61.5, lat: 16.2, count: 1 });
    expect(isOverseasPoint(nyc!)).toBe(true);
    expect(isOverseasPoint(gosier!)).toBe(true);
    expect(agg.totals).toEqual({ members: 3, clubs: 2, departments: 0 });
  });

  it("compte les membres dont le club n'a aucune coordonnée comme non localisés", () => {
    const agg = aggregateHomeClubs([
      row({ clubId: "z", latitude: null, longitude: null, zipcode: "31000" }),
      row({ clubId: "w", country: "BE", latitude: null, longitude: null, zipcode: null }),
    ]);
    expect(agg.unlocated).toBe(2);
    expect(agg.points).toHaveLength(0);
    expect(agg.totals.members).toBe(2);
  });
});

describe("groupOverseasByCountry", () => {
  it("regroupe et trie les points hors métropole par pays, ignore la métropole", () => {
    const agg = aggregateHomeClubs([
      row({ clubId: "a", country: "DE", zipcode: null, latitude: 52.5, longitude: 13.4 }),
      row({ clubId: "b", country: "DE", zipcode: null, latitude: 50.9, longitude: 6.9 }),
      row({ clubId: "c", country: "CH", zipcode: null, latitude: 46.2, longitude: 6.1 }),
      row({ clubId: "d", country: "FR", zipcode: "75001", latitude: 48.86, longitude: 2.35 }),
    ]);
    expect(groupOverseasByCountry(agg.points)).toEqual([
      { country: "DE", count: 2 },
      { country: "CH", count: 1 },
    ]);
  });
});
