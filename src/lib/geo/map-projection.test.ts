import { describe, it, expect } from "vitest";
import {
  makeEquirectProjector,
  boundsOfPoints,
  padBounds,
  unionBounds,
  clampBounds,
  WORLD_BOUNDS,
  type LonLatBounds,
} from "./map-projection";

const BERLIN_NYC: LonLatBounds = { lonMin: -74, lonMax: 13.4, latMin: 40.7, latMax: 52.5 };

describe("makeEquirectProjector", () => {
  it("projette les coins des bornes dans le cadre, dans le bon sens", () => {
    const p = makeEquirectProjector(BERLIN_NYC, 300, 200, 4);
    const nw = p.project(BERLIN_NYC.lonMin, BERLIN_NYC.latMax);
    const se = p.project(BERLIN_NYC.lonMax, BERLIN_NYC.latMin);
    for (const pt of [nw, se]) {
      expect(pt.x).toBeGreaterThanOrEqual(0);
      expect(pt.x).toBeLessThanOrEqual(300);
      expect(pt.y).toBeGreaterThanOrEqual(0);
      expect(pt.y).toBeLessThanOrEqual(200);
    }
    expect(nw.x).toBeLessThan(se.x); // ouest à gauche
    expect(nw.y).toBeLessThan(se.y); // nord en haut
  });
});

describe("boundsOfPoints", () => {
  it("renvoie le rectangle englobant", () => {
    expect(boundsOfPoints([{ lon: -74, lat: 40.7 }, { lon: 2.3, lat: 48.9 }, { lon: 13.4, lat: 52.5 }])).toEqual({
      lonMin: -74,
      lonMax: 13.4,
      latMin: 40.7,
      latMax: 52.5,
    });
  });
  it("renvoie null si vide", () => {
    expect(boundsOfPoints([])).toBeNull();
  });
});

describe("padBounds", () => {
  it("impose une taille minimale et ajoute une marge", () => {
    const b = padBounds({ lonMin: 2, lonMax: 2, latMin: 48, latMax: 48 }, 0.1, 20, 15);
    expect(b.lonMax - b.lonMin).toBeCloseTo(22, 5); // 20 * 1.1
    expect(b.latMax - b.latMin).toBeCloseTo(16.5, 5); // 15 * 1.1
    expect((b.lonMin + b.lonMax) / 2).toBeCloseTo(2, 5); // centré
  });
});

describe("unionBounds / clampBounds", () => {
  it("union prend l'enveloppe des deux", () => {
    expect(
      unionBounds({ lonMin: 0, lonMax: 5, latMin: 0, latMax: 5 }, { lonMin: -3, lonMax: 2, latMin: 4, latMax: 9 }),
    ).toEqual({ lonMin: -3, lonMax: 5, latMin: 0, latMax: 9 });
  });
  it("clamp ne déborde pas du monde", () => {
    const c = clampBounds({ lonMin: -200, lonMax: 250, latMin: -95, latMax: 120 }, WORLD_BOUNDS);
    expect(c).toEqual(WORLD_BOUNDS);
  });
});
