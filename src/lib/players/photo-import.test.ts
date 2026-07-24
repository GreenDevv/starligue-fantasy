import { describe, it, expect } from "vitest";
import { matchPlayerPhotoRows, type PlayerForPhotoMatching, type PlayerPhotoRow } from "./photo-import";

function player(overrides: Partial<PlayerForPhotoMatching> = {}): PlayerForPhotoMatching {
  return {
    id: "p1",
    firstName: "Luka",
    lastName: "Karabatic",
    clubShortName: "PSG",
    photoUrl: null,
    ...overrides,
  };
}

function row(overrides: Partial<PlayerPhotoRow> = {}): PlayerPhotoRow {
  return { nom: "Karabatic", prenom: "Luka", club: "PSG", photoUrl: "https://media.psg.fr/karabatic.png", ...overrides };
}

describe("matchPlayerPhotoRows", () => {
  it("matches exact name+club and reports an update when the photo is new", () => {
    const result = matchPlayerPhotoRows([row()], [player()]);
    expect(result.updates).toEqual([
      {
        playerId: "p1",
        firstName: "Luka",
        lastName: "Karabatic",
        clubShortName: "PSG",
        oldPhotoUrl: null,
        newPhotoUrl: "https://media.psg.fr/karabatic.png",
      },
    ]);
    expect(result.unchanged).toHaveLength(0);
    expect(result.unmatched).toHaveLength(0);
  });

  it("reports unchanged when the photo URL is already the same", () => {
    const result = matchPlayerPhotoRows(
      [row()],
      [player({ photoUrl: "https://media.psg.fr/karabatic.png" })],
    );
    expect(result.updates).toHaveLength(0);
    expect(result.unchanged).toHaveLength(1);
  });

  it("matches case/accent-insensitively", () => {
    const result = matchPlayerPhotoRows(
      [row({ nom: "KARABATIC", prenom: "luka", club: "psg" })],
      [player({ lastName: "Karabàtic" })],
    );
    expect(result.updates).toHaveLength(1);
    expect(result.unmatched).toHaveLength(0);
  });

  it("does not match across the wrong club (never silently reassigns)", () => {
    const result = matchPlayerPhotoRows([row({ club: "MHB" })], [player({ clubShortName: "PSG" })]);
    expect(result.unmatched).toEqual([{ row: row({ club: "MHB" }), reason: "player_not_found" }]);
  });

  it("reports ambiguous_match when two players normalize to the same key", () => {
    const players = [
      player({ id: "p1", firstName: "José" }),
      player({ id: "p2", firstName: "Jose" }),
    ];
    const result = matchPlayerPhotoRows([row({ prenom: "jose" })], players);
    expect(result.updates).toHaveLength(0);
    expect(result.unmatched).toEqual([{ row: row({ prenom: "jose" }), reason: "ambiguous_match" }]);
  });

  it("never creates or deletes players — only returns matches for existing ones", () => {
    const result = matchPlayerPhotoRows(
      [row(), row({ nom: "Inconnu", prenom: "Joueur", club: "XXX" })],
      [player()],
    );
    expect(result.updates).toHaveLength(1);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]!.reason).toBe("player_not_found");
  });

  it("handles an empty row list", () => {
    const result = matchPlayerPhotoRows([], [player()]);
    expect(result).toEqual({ updates: [], unchanged: [], unmatched: [] });
  });
});
