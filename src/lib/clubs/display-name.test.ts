import { describe, it, expect } from "vitest";
import { clubDisplayName } from "./display-name";

describe("clubDisplayName", () => {
  it("affiche le nom du club plutôt que l'abréviation technique", () => {
    expect(clubDisplayName({ shortName: "CSMBH", displayName: "Chambéry" })).toBe("Chambéry");
  });
  it("repli sur l'abréviation si aucun nom (ou nom vide)", () => {
    expect(clubDisplayName({ shortName: "CSMBH" })).toBe("CSMBH");
    expect(clubDisplayName({ shortName: "CSMBH", displayName: "  " })).toBe("CSMBH");
  });
});
