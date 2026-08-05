import { describe, it, expect } from "vitest";
import { selectUsersForLineupReminder, selectUsersForPredictionReminder } from "./deadline-reminders";

describe("selectUsersForLineupReminder", () => {
  it("relance une équipe non validée", () => {
    const result = selectUsersForLineupReminder([
      { userId: "u1", isValidated: false, captainId: "p1" },
    ]);
    expect(result).toEqual(["u1"]);
  });

  it("relance une équipe validée mais sans capitaine", () => {
    const result = selectUsersForLineupReminder([
      { userId: "u1", isValidated: true, captainId: null },
    ]);
    expect(result).toEqual(["u1"]);
  });

  it("ignore une équipe validée avec capitaine", () => {
    const result = selectUsersForLineupReminder([
      { userId: "u1", isValidated: true, captainId: "p1" },
    ]);
    expect(result).toEqual([]);
  });

  it("dédoublonne un même utilisateur sur plusieurs équipes", () => {
    const result = selectUsersForLineupReminder([
      { userId: "u1", isValidated: false, captainId: null },
      { userId: "u1", isValidated: false, captainId: null },
    ]);
    expect(result).toEqual(["u1"]);
  });
});

describe("selectUsersForPredictionReminder", () => {
  it("relance une équipe sans pronostic", () => {
    const result = selectUsersForPredictionReminder(
      [{ userId: "u1", fantasyTeamId: "t1" }],
      []
    );
    expect(result).toEqual(["u1"]);
  });

  it("ignore une équipe qui a déjà pronostiqué", () => {
    const result = selectUsersForPredictionReminder(
      [{ userId: "u1", fantasyTeamId: "t1" }],
      ["t1"]
    );
    expect(result).toEqual([]);
  });

  it("ne relance que les équipes manquantes parmi plusieurs", () => {
    const result = selectUsersForPredictionReminder(
      [
        { userId: "u1", fantasyTeamId: "t1" },
        { userId: "u2", fantasyTeamId: "t2" },
      ],
      ["t1"]
    );
    expect(result).toEqual(["u2"]);
  });
});
