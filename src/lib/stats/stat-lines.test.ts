import { describe, it, expect } from "vitest";
import { ALL_STAT_LINES, statLinesFor } from "./stat-lines";
import { getCompetitionProfile } from "@/lib/competition/profile";

describe("statLinesFor", () => {
  it("Starligue : toutes les lignes, ordre inchangé", () => {
    expect(statLinesFor(getCompetitionProfile("LNH"))).toEqual(ALL_STAT_LINES);
  });

  it("LBE : seulement les stats publiées par la LFH", () => {
    expect(statLinesFor(getCompetitionProfile("LFH")).map((l) => l.key)).toEqual([
      "goalsPlay",
      "goalsPenalty",
      "goalsTotal",
      "shotPercentage",
      "saves",
      "savePercentage",
      "twoMinTaken",
      "disqualified",
    ]);
  });

  it.each(["LNH", "LFH"] as const)("%s : les stats par défaut existent toutes", (id) => {
    const p = getCompetitionProfile(id);
    const keys = statLinesFor(p).map((l) => l.key);
    expect(p.defaultStatKeys.every((k) => keys.includes(k))).toBe(true);
  });
});
