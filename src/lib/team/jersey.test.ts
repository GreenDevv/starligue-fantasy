import { describe, it, expect } from "vitest";
import {
  jerseyConfigSchema,
  safeJerseyConfig,
  zoneColor,
  DEFAULT_JERSEY_CONFIG,
} from "./jersey";

describe("DEFAULT_JERSEY_CONFIG", () => {
  it("est un JerseyConfig valide", () => {
    expect(jerseyConfigSchema.safeParse(DEFAULT_JERSEY_CONFIG).success).toBe(true);
  });
});

describe("safeJerseyConfig — format courant", () => {
  it("laisse passer une config déjà valide inchangée", () => {
    const config = {
      jersey: { patternId: "hoops-4", colors: ["#111111", "#222222"] },
      shorts: { patternId: "solid", colors: ["#111111"] },
      socks: { patternId: "solid", colors: ["#111111"] },
      collar: "v-neck",
      trimColor: "#F59E0B",
      contrastSleeves: true,
      number: 7,
      nameFlock: "TISH",
    };
    expect(safeJerseyConfig(config)).toEqual(config);
  });
});

describe("safeJerseyConfig — migration de l'ancien format", () => {
  const legacy = {
    primaryColor: "#2DD4BF",
    secondaryColor: "#0E1116",
    tertiaryColor: "#F59E0B",
    pattern: "stripes",
    collar: "polo",
    contrastSleeves: true,
    number: 9,
    nameFlock: "MARTIN",
  };

  it("migre les couleurs, le motif, le col et les champs racine", () => {
    const migrated = safeJerseyConfig(legacy);
    expect(migrated.jersey).toEqual({ patternId: "stripes-4", colors: ["#2DD4BF", "#0E1116"] });
    expect(migrated.shorts.patternId).toBe("solid");
    expect(migrated.socks.patternId).toBe("solid");
    expect(migrated.collar).toBe("polo");
    expect(migrated.trimColor).toBe("#F59E0B");
    expect(migrated.contrastSleeves).toBe(true);
    expect(migrated.number).toBe(9);
    expect(migrated.nameFlock).toBe("MARTIN");
  });

  it.each([
    ["solid", "solid"],
    ["stripes", "stripes-4"],
    ["hoops", "hoops-4"],
    ["sash", "sash-thin"],
    ["halves", "halves-vertical"],
  ])("mappe l'ancien motif %s vers %s", (oldPattern, newPatternId) => {
    const migrated = safeJerseyConfig({ ...legacy, pattern: oldPattern });
    expect(migrated.jersey.patternId).toBe(newPatternId);
  });

  it("retombe sur 'solid' pour un ancien motif inconnu", () => {
    const migrated = safeJerseyConfig({ ...legacy, pattern: "unknown-pattern" });
    expect(migrated.jersey.patternId).toBe("solid");
  });
});

describe("safeJerseyConfig — entrées invalides", () => {
  it.each([null, undefined, "not an object", 42, [], {}])(
    "retombe sur DEFAULT_JERSEY_CONFIG pour %j",
    (raw) => {
      expect(safeJerseyConfig(raw)).toEqual(DEFAULT_JERSEY_CONFIG);
    },
  );
});

describe("zoneColor", () => {
  it("renvoie la couleur du slot demandé", () => {
    expect(zoneColor({ patternId: "solid", colors: ["#111111", "#222222"] }, 1)).toBe("#222222");
  });

  it("retombe sur la première couleur si le slot est hors limites", () => {
    expect(zoneColor({ patternId: "solid", colors: ["#111111"] }, 3)).toBe("#111111");
  });
});
