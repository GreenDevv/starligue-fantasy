import { describe, it, expect } from "vitest";
import { resolveAuctionRound, type AuctionRoundBid } from "./resolve";

function bid(id: string, teamId: string, playerId: string, amount: number): AuctionRoundBid {
  return { id, teamId, playerId, amount };
}

describe("resolveAuctionRound", () => {
  it("une seule enchère sur un joueur → elle gagne", () => {
    const { winners, losers } = resolveAuctionRound([bid("b1", "team-a", "p1", 10)]);
    expect(winners).toEqual([{ bidId: "b1", teamId: "team-a", playerId: "p1", amount: 10 }]);
    expect(losers).toEqual([]);
  });

  it("plusieurs enchères, une plus haute → elle gagne, les autres perdent", () => {
    const { winners, losers } = resolveAuctionRound([
      bid("b1", "team-a", "p1", 10),
      bid("b2", "team-b", "p1", 15),
      bid("b3", "team-c", "p1", 5),
    ]);
    expect(winners).toEqual([{ bidId: "b2", teamId: "team-b", playerId: "p1", amount: 15 }]);
    expect(losers.map((l) => l.bidId).sort()).toEqual(["b1", "b3"]);
  });

  it("égalité sur la plus haute enchère → personne ne gagne", () => {
    const { winners, losers } = resolveAuctionRound([
      bid("b1", "team-a", "p1", 10),
      bid("b2", "team-b", "p1", 10),
    ]);
    expect(winners).toEqual([]);
    expect(losers.map((l) => l.bidId).sort()).toEqual(["b1", "b2"]);
  });

  it("égalité à 3 enchérisseurs → personne ne gagne, tous perdants", () => {
    const { winners, losers } = resolveAuctionRound([
      bid("b1", "team-a", "p1", 20),
      bid("b2", "team-b", "p1", 20),
      bid("b3", "team-c", "p1", 20),
    ]);
    expect(winners).toEqual([]);
    expect(losers).toHaveLength(3);
  });

  it("plusieurs joueurs indépendants dans le même tour", () => {
    const { winners, losers } = resolveAuctionRound([
      bid("b1", "team-a", "p1", 10),
      bid("b2", "team-b", "p1", 15),
      bid("b3", "team-a", "p2", 20),
      bid("b4", "team-b", "p2", 20),
    ]);
    expect(winners).toEqual([{ bidId: "b2", teamId: "team-b", playerId: "p1", amount: 15 }]);
    expect(losers.map((l) => l.bidId).sort()).toEqual(["b1", "b3", "b4"]);
  });

  it("aucune enchère → aucun gagnant ni perdant", () => {
    expect(resolveAuctionRound([])).toEqual({ winners: [], losers: [] });
  });
});
