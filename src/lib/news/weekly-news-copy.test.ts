import { describe, expect, it } from "vitest";
import { teamOfWeekCopy, performancesCopy } from "./weekly-news-copy";

describe("teamOfWeekCopy", () => {
  const base = {
    gameweekNumber: 1,
    entries: [
      { position: "GK" as const, firstName: "Milos", lastName: "Mocevic", clubShortName: "CAEN", points: 78 },
      { position: "LW" as const, firstName: "Nemanja", lastName: "Ilic", clubShortName: "FENIX", points: 51.2 },
      { position: "LB" as const, firstName: "Adam", lastName: "Gnago", clubShortName: "CAEN", points: 56.4 },
      { position: "CB" as const, firstName: "Jules", lastName: "Lignières", clubShortName: "LIMOGES", points: 69.2 },
      { position: "RB" as const, firstName: "Valentin", lastName: "Porte", clubShortName: "MHB", points: 58 },
      { position: "RW" as const, firstName: "Alex", lastName: "Moran", clubShortName: "CRMHB", points: 40.4 },
      { position: "PV" as const, firstName: "Hugo", lastName: "Kamtchop Baril", clubShortName: "USAM", points: 56 },
    ],
  };

  it("titre + chapo citent le meilleur total", () => {
    const c = teamOfWeekCopy(base);
    expect(c.title).toBe("L'équipe type de la journée 1");
    expect(c.excerpt).toContain("Milos Mocevic");
    expect(c.excerpt).toContain("78");
    expect(c.excerpt).toContain("CAEN");
  });

  it("le corps mentionne les clubs qui placent plusieurs joueurs et liste les 7 postes", () => {
    const c = teamOfWeekCopy(base);
    expect(c.content).toContain("CAEN (2 joueurs)");
    expect(c.content).toContain("Valentin Porte");
    expect(c.content).toContain("Hugo Kamtchop Baril");
    expect(c.content.split("\n\n").length).toBeGreaterThanOrEqual(3);
  });

  it("ne plante pas sur une équipe partielle", () => {
    const c = teamOfWeekCopy({ gameweekNumber: 3, entries: base.entries.slice(0, 2) });
    expect(c.title).toBe("L'équipe type de la journée 3");
    expect(c.content.length).toBeGreaterThan(0);
  });
});

describe("performancesCopy", () => {
  const base = {
    gameweekNumber: 1,
    entries: [
      { firstName: "Milos", lastName: "Mocevic", clubShortName: "CAEN", points: 78, lnhRating: 24 },
      { firstName: "Charles", lastName: "Bolzinger", clubShortName: "MHB", points: 70, lnhRating: 22.5 },
      { firstName: "Jules", lastName: "Lignières", clubShortName: "LIMOGES", points: 69.2, lnhRating: 21.3 },
    ],
  };

  it("chapo cite le n°1 avec points et note", () => {
    const c = performancesCopy(base);
    expect(c.excerpt).toContain("Milos Mocevic");
    expect(c.excerpt).toContain("78");
    expect(c.content).toContain("note LNH de 24");
  });

  it("le corps liste le reste du top", () => {
    const c = performancesCopy(base);
    expect(c.content).toContain("2. Charles Bolzinger (MHB) — 70 pts (note 22.5)");
    expect(c.content).toContain("3. Jules Lignières");
  });

  it("gère une note LNH absente", () => {
    const c = performancesCopy({
      gameweekNumber: 2,
      entries: [{ firstName: "A", lastName: "B", clubShortName: "PSG", points: 40, lnhRating: null }],
    });
    expect(c.excerpt).not.toContain("note");
    expect(c.content).toContain("A B");
  });
});
