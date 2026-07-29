import { describe, it, expect } from "vitest";
import { validateAuctionBids, type AuctionValidationContext, type AuctionPlayerInfo } from "./validate";

function ctx(overrides: Partial<AuctionValidationContext> = {}): AuctionValidationContext {
  return {
    budget: 500,
    playersById: new Map<string, AuctionPlayerInfo>(),
    squadPositionCounts: {},
    squadClubCounts: {},
    ...overrides,
  };
}

describe("validateAuctionBids — cas valides", () => {
  it("enchères dans le budget, postes/clubs libres → valide", () => {
    const players = new Map<string, AuctionPlayerInfo>([
      ["p1", { position: "GK", clubId: "club-1" }],
      ["p2", { position: "LW", clubId: "club-2" }],
    ]);
    const result = validateAuctionBids(
      [
        { playerId: "p1", amount: 50 },
        { playerId: "p2", amount: 30 },
      ],
      ctx({ playersById: players })
    );
    expect(result.valid).toBe(true);
  });

  it("aucune enchère (effectif déjà complet) → valide", () => {
    expect(validateAuctionBids([], ctx()).valid).toBe(true);
  });
});

describe("validateAuctionBids — erreurs", () => {
  it("montant total > budget restant → BUDGET_EXCEEDED", () => {
    const players = new Map<string, AuctionPlayerInfo>([
      ["p1", { position: "GK", clubId: "club-1" }],
    ]);
    const result = validateAuctionBids(
      [{ playerId: "p1", amount: 600 }],
      ctx({ budget: 500, playersById: players })
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({ code: "BUDGET_EXCEEDED", budget: 500, total: 600, overage: 100 });
  });

  it("joueur inconnu → UNKNOWN_PLAYER", () => {
    const result = validateAuctionBids([{ playerId: "ghost", amount: 10 }], ctx());
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({ code: "UNKNOWN_PLAYER", playerId: "ghost" });
  });

  it("même joueur enchéri deux fois → DUPLICATE_BID", () => {
    const players = new Map<string, AuctionPlayerInfo>([["p1", { position: "GK", clubId: "club-1" }]]);
    const result = validateAuctionBids(
      [
        { playerId: "p1", amount: 10 },
        { playerId: "p1", amount: 20 },
      ],
      ctx({ playersById: players, budget: 500 })
    );
    expect(result.errors).toContainEqual({ code: "DUPLICATE_BID", playerId: "p1" });
  });

  it("montant nul ou négatif → INVALID_AMOUNT", () => {
    const players = new Map<string, AuctionPlayerInfo>([["p1", { position: "GK", clubId: "club-1" }]]);
    const result = validateAuctionBids([{ playerId: "p1", amount: 0 }], ctx({ playersById: players }));
    expect(result.errors).toContainEqual({ code: "INVALID_AMOUNT", playerId: "p1" });
  });

  it("plus de bids sur un poste que de slots restants → POSITION_FULL", () => {
    const players = new Map<string, AuctionPlayerInfo>([
      ["p1", { position: "GK", clubId: "club-1" }],
      ["p2", { position: "GK", clubId: "club-2" }],
    ]);
    // déjà 1 gardien dans l'effectif → il n'en reste qu'1 slot, mais 2 bids sur GK
    const result = validateAuctionBids(
      [
        { playerId: "p1", amount: 10 },
        { playerId: "p2", amount: 10 },
      ],
      ctx({ playersById: players, squadPositionCounts: { GK: 1 } })
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({ code: "POSITION_FULL", position: "GK", remaining: 1, requested: 2 });
  });

  it("poste déjà complet (2/2) → toute enchère dessus est POSITION_FULL", () => {
    const players = new Map<string, AuctionPlayerInfo>([["p1", { position: "GK", clubId: "club-1" }]]);
    const result = validateAuctionBids(
      [{ playerId: "p1", amount: 10 }],
      ctx({ playersById: players, squadPositionCounts: { GK: 2 } })
    );
    expect(result.errors).toContainEqual({ code: "POSITION_FULL", position: "GK", remaining: 0, requested: 1 });
  });

  it("club déjà au max en tenant compte des enchères en cours → TOO_MANY_PLAYERS_FROM_CLUB", () => {
    const players = new Map<string, AuctionPlayerInfo>([
      ["p1", { position: "GK", clubId: "club-1" }],
      ["p2", { position: "LW", clubId: "club-1" }],
    ]);
    // déjà 2 joueurs de club-1 dans l'effectif, max = 3, on enchérit sur 2 de plus → 4 > 3
    const result = validateAuctionBids(
      [
        { playerId: "p1", amount: 10 },
        { playerId: "p2", amount: 10 },
      ],
      ctx({ playersById: players, squadClubCounts: { "club-1": 2 }, maxPlayersPerClub: 3 })
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({ code: "TOO_MANY_PLAYERS_FROM_CLUB", clubId: "club-1", count: 4, max: 3 });
  });
});
