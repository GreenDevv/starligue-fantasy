import { describe, it, expect } from "vitest";
import { matchPlayerValueRows, type PlayerForMatching, type PlayerValueRow } from "./value-import";

function player(overrides: Partial<PlayerForMatching> = {}): PlayerForMatching {
  return {
    id: "p1",
    firstName: "Luka",
    lastName: "Karabatic",
    clubShortName: "PSG",
    marketValue: 15.0,
    ...overrides,
  };
}

function row(overrides: Partial<PlayerValueRow> = {}): PlayerValueRow {
  return { nom: "Karabatic", prenom: "Luka", club: "PSG", valeur: 15.0, ...overrides };
}

describe("matchPlayerValueRows", () => {
  it("matches exact name+club and reports an update when the value changed", () => {
    const result = matchPlayerValueRows([row({ valeur: 16.5 })], [player()]);
    expect(result.updates).toEqual([
      { playerId: "p1", firstName: "Luka", lastName: "Karabatic", clubShortName: "PSG", oldValue: 15.0, newValue: 16.5 },
    ]);
    expect(result.unchanged).toHaveLength(0);
    expect(result.unmatched).toHaveLength(0);
  });

  it("reports unchanged when the value is the same", () => {
    const result = matchPlayerValueRows([row({ valeur: 15.0 })], [player()]);
    expect(result.updates).toHaveLength(0);
    expect(result.unchanged).toHaveLength(1);
  });

  it("treats a sub-0.05 float drift as unchanged (rounding noise)", () => {
    const result = matchPlayerValueRows([row({ valeur: 15.02 })], [player()]);
    expect(result.updates).toHaveLength(0);
    expect(result.unchanged).toHaveLength(1);
  });

  it("matches case/accent-insensitively", () => {
    const result = matchPlayerValueRows(
      [row({ nom: "KARABATIC", prenom: "luka", club: "psg", valeur: 20 })],
      [player({ lastName: "Karabàtic" })],
    );
    expect(result.updates).toHaveLength(1);
    expect(result.unmatched).toHaveLength(0);
  });

  it("reports player_not_found when no player matches name+club", () => {
    const result = matchPlayerValueRows([row({ club: "MHB" })], [player()]);
    expect(result.updates).toHaveLength(0);
    expect(result.unmatched).toEqual([{ row: row({ club: "MHB" }), reason: "player_not_found" }]);
  });

  it("does not match across the wrong club (never silently reassigns)", () => {
    const result = matchPlayerValueRows(
      [row({ club: "MHB" })],
      [player({ clubShortName: "PSG" })],
    );
    expect(result.unmatched[0]?.reason).toBe("player_not_found");
  });

  it("reports ambiguous_match when two players normalize to the same key", () => {
    const players = [
      player({ id: "p1", firstName: "José" }),
      player({ id: "p2", firstName: "Jose" }),
    ];
    const result = matchPlayerValueRows([row({ prenom: "jose" })], players);
    expect(result.updates).toHaveLength(0);
    expect(result.unmatched).toEqual([{ row: row({ prenom: "jose" }), reason: "ambiguous_match" }]);
  });

  it("never creates or deletes players — only returns matches for existing ones", () => {
    const result = matchPlayerValueRows(
      [row({ valeur: 18.0 }), row({ nom: "Inconnu", prenom: "Joueur", club: "XXX" })],
      [player()],
    );
    expect(result.updates).toHaveLength(1);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]!.reason).toBe("player_not_found");
  });

  it("handles an empty row list", () => {
    const result = matchPlayerValueRows([], [player()]);
    expect(result).toEqual({ updates: [], unchanged: [], unmatched: [] });
  });
});
