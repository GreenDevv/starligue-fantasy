import { describe, it, expect } from "vitest";
import { getLastFiveForm, type ClubPageMatch } from "./club-page-data";

const OPPONENT = { id: "opp", shortName: "OPP", name: "Opponent", logoUrl: null };

function match(id: string, ownScore: number | null, opponentScore: number | null): ClubPageMatch {
  return {
    id,
    gameweekNumber: 1,
    kickoffAt: new Date(),
    isHome: true,
    opponent: OPPONENT,
    ownScore,
    opponentScore,
  };
}

describe("getLastFiveForm", () => {
  it("retourne 5 null quand aucun match n'a été joué", () => {
    expect(getLastFiveForm([])).toEqual([null, null, null, null, null]);
  });

  it("complète à gauche avec des null quand moins de 5 matchs joués", () => {
    // results = plus récent d'abord (convention getClubPageData)
    const results = [match("2", 30, 25), match("1", 20, 22)];
    const lastFive = getLastFiveForm(results);
    expect(lastFive).toHaveLength(5);
    expect(lastFive.slice(0, 3)).toEqual([null, null, null]);
    // ordre chronologique : le plus ancien (match "1") avant le plus récent (match "2")
    expect(lastFive[3]?.id).toBe("1");
    expect(lastFive[4]?.id).toBe("2");
  });

  it("ne garde que les 5 derniers en ordre chronologique quand plus de 5 matchs joués", () => {
    // results = plus récent d'abord ("6" = le plus récent, "1" = le plus ancien) ;
    // "1" doit être ignoré (6ᵉ match en partant du plus récent).
    const results = [match("6", 1, 0), match("5", 1, 0), match("4", 1, 0), match("3", 1, 0), match("2", 1, 0), match("1", 1, 0)];
    const lastFive = getLastFiveForm(results);
    expect(lastFive.map((m) => m?.id)).toEqual(["2", "3", "4", "5", "6"]);
  });
});
