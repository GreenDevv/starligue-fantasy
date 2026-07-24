import { describe, it, expect } from "vitest";
import { validateTradeExecution, resolveTradeStatus, type TradeExecutionInput } from "./proposal";
import type { SquadPlayer } from "@/lib/squad/validation";

function fullSquad(overrides: Partial<Record<string, SquadPlayer>> = {}, prefix = "p"): SquadPlayer[] {
  const positions = ["GK", "LW", "LB", "CB", "RB", "RW", "PV"] as const;
  const players: SquadPlayer[] = [];
  for (const pos of positions) {
    for (let i = 1; i <= 2; i++) {
      const id = `${prefix}-${pos}-${i}`;
      players.push(overrides[id] ?? { id, position: pos, marketValue: 8, isActive: true });
    }
  }
  return players;
}

function baseInput(overrides: Partial<TradeExecutionInput> = {}): TradeExecutionInput {
  return {
    proposerSquad: fullSquad({}, "a"),
    proposerBudget: 5,
    receiverSquad: fullSquad({}, "b"),
    receiverBudget: 5,
    offeredPlayerIds: ["a-CB-1"],
    requestedPlayerIds: ["b-CB-1"],
    budgetAdjustment: 0,
    ...overrides,
  };
}

describe("validateTradeExecution", () => {
  it("échange 1-pour-1 au même poste, budgets suffisants → valid", () => {
    const result = validateTradeExecution(baseInput());
    expect(result.valid).toBe(true);
    expect(result.newProposerBudget).toBe(5);
    expect(result.newReceiverBudget).toBe(5);
  });

  it("échange à des postes différents reste valide tant que 2/poste est respecté des deux côtés", () => {
    const result = validateTradeExecution(
      baseInput({ offeredPlayerIds: ["a-CB-1"], requestedPlayerIds: ["b-RW-1"] })
    );
    expect(result.valid).toBe(false); // a perd son 2e CB (reste 1), gagne un 2e RW (reste 3) → invalide des 2 côtés
    expect(result.errors.some((e) => e.code === "INVALID_RESULTING_SQUAD" && e.side === "PROPOSER")).toBe(true);
    expect(result.errors.some((e) => e.code === "INVALID_RESULTING_SQUAD" && e.side === "RECEIVER")).toBe(true);
  });

  it("aucun joueur échangé → EMPTY_TRADE", () => {
    const result = validateTradeExecution(baseInput({ offeredPlayerIds: [], requestedPlayerIds: [] }));
    expect(result.errors.some((e) => e.code === "EMPTY_TRADE")).toBe(true);
  });

  it("joueur offert absent de l'effectif du proposeur → PLAYER_NOT_IN_SQUAD side PROPOSER", () => {
    const result = validateTradeExecution(baseInput({ offeredPlayerIds: ["unknown"] }));
    expect(result.errors.some((e) => e.code === "PLAYER_NOT_IN_SQUAD" && e.side === "PROPOSER")).toBe(true);
  });

  it("joueur demandé absent de l'effectif du destinataire → PLAYER_NOT_IN_SQUAD side RECEIVER", () => {
    const result = validateTradeExecution(baseInput({ requestedPlayerIds: ["unknown"] }));
    expect(result.errors.some((e) => e.code === "PLAYER_NOT_IN_SQUAD" && e.side === "RECEIVER")).toBe(true);
  });

  it("joueur inactif (blessé/parti) inclus dans l'échange → INACTIVE_PLAYER", () => {
    const result = validateTradeExecution(
      baseInput({
        receiverSquad: fullSquad({ "b-CB-1": { id: "b-CB-1", position: "CB", marketValue: 8, isActive: false } }, "b"),
      })
    );
    expect(result.errors.some((e) => e.code === "INACTIVE_PLAYER" && e.playerId === "b-CB-1")).toBe(true);
  });

  it("budget insuffisant côté proposeur après ajustement → BUDGET_EXCEEDED side PROPOSER", () => {
    const result = validateTradeExecution(baseInput({ budgetAdjustment: 10 }));
    const err = result.errors.find((e) => e.code === "BUDGET_EXCEEDED");
    expect(err).toMatchObject({ code: "BUDGET_EXCEEDED", side: "PROPOSER", shortfall: 5 });
  });

  it("budget insuffisant côté destinataire après ajustement → BUDGET_EXCEEDED side RECEIVER", () => {
    const result = validateTradeExecution(baseInput({ budgetAdjustment: -10 }));
    const err = result.errors.find((e) => e.code === "BUDGET_EXCEEDED");
    expect(err).toMatchObject({ code: "BUDGET_EXCEEDED", side: "RECEIVER", shortfall: 5 });
  });

  it("ajustement de budget positif crédite le destinataire et débite le proposeur", () => {
    const result = validateTradeExecution(baseInput({ budgetAdjustment: 3 }));
    expect(result.newProposerBudget).toBe(2);
    expect(result.newReceiverBudget).toBe(8);
  });

  it("trade N-pour-N (2 contre 2) valide si les deux effectifs restent à 2/poste", () => {
    const result = validateTradeExecution(
      baseInput({ offeredPlayerIds: ["a-CB-1", "a-CB-2"], requestedPlayerIds: ["b-CB-1", "b-CB-2"] })
    );
    expect(result.valid).toBe(true);
  });
});

describe("resolveTradeStatus", () => {
  it("PENDING avant expiration reste PENDING", () => {
    expect(resolveTradeStatus("PENDING", new Date("2026-08-01"), new Date("2026-07-15"))).toBe("PENDING");
  });

  it("PENDING après expiration devient EXPIRED", () => {
    expect(resolveTradeStatus("PENDING", new Date("2026-07-01"), new Date("2026-07-15"))).toBe("EXPIRED");
  });

  it("statut déjà terminal (ACCEPTED) n'est jamais réécrit en EXPIRED", () => {
    expect(resolveTradeStatus("ACCEPTED", new Date("2026-07-01"), new Date("2026-07-15"))).toBe("ACCEPTED");
  });
});
