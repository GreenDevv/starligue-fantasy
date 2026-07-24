import { describe, it, expect } from "vitest";
import { computeGameweekValueDeltas, DEFAULT_VALUE_ADJUSTMENT_CONFIG } from "./value-adjustment";
import type { ValueAdjustmentInput } from "./value-adjustment";

function makeGroup(position: ValueAdjustmentInput["position"], ratings: number[]): ValueAdjustmentInput[] {
  return ratings.map((lnhRating, i) => ({ playerId: `${position}-${i}`, position, lnhRating }));
}

describe("computeGameweekValueDeltas", () => {
  it("poste avec exactement 10 joueurs notés → top5 +0.5, bottom5 -0.5, aucun autre", () => {
    // ratings 1..10 → bottom5 = joueurs 0..4 (notes 1-5), top5 = joueurs 5..9 (notes 6-10)
    const group = makeGroup("GK", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const deltas = computeGameweekValueDeltas(group);
    expect(deltas.size).toBe(10);
    for (let i = 0; i < 5; i++) expect(deltas.get(`GK-${i}`)).toBe(-0.5);
    for (let i = 5; i < 10; i++) expect(deltas.get(`GK-${i}`)).toBe(0.5);
  });

  it("poste avec plus de 10 joueurs → seuls les 5 extrêmes de chaque bout bougent, le milieu reste à 0", () => {
    const group = makeGroup("LW", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const deltas = computeGameweekValueDeltas(group);
    expect(deltas.size).toBe(10); // 5 bottom + 5 top ; 6 du milieu absents de la map
    expect(deltas.has("LW-7")).toBe(false); // note 8, au milieu
    expect(deltas.has("LW-8")).toBe(false); // note 9, au milieu
    expect(deltas.get("LW-0")).toBe(-0.5); // note 1, pire
    expect(deltas.get("LW-15")).toBe(0.5); // note 16, meilleur
  });

  it("poste avec peu de joueurs notés (n < topN+bottomN) → réduit symétriquement sans chevauchement", () => {
    // n=7 → floor(7/2)=3 de chaque côté, le joueur médian (index 3) ne bouge pas
    const group = makeGroup("PV", [1, 2, 3, 4, 5, 6, 7]);
    const deltas = computeGameweekValueDeltas(group);
    expect(deltas.size).toBe(6);
    expect(deltas.has("PV-3")).toBe(false); // note 4, médiane
    expect(deltas.get("PV-0")).toBe(-0.5);
    expect(deltas.get("PV-1")).toBe(-0.5);
    expect(deltas.get("PV-2")).toBe(-0.5);
    expect(deltas.get("PV-4")).toBe(0.5);
    expect(deltas.get("PV-5")).toBe(0.5);
    expect(deltas.get("PV-6")).toBe(0.5);
  });

  it("un seul joueur noté à un poste → aucun ajustement (pas de comparaison possible)", () => {
    const group = makeGroup("RB", [7]);
    const deltas = computeGameweekValueDeltas(group);
    expect(deltas.size).toBe(0);
  });

  it("deux joueurs notés → un seul de chaque côté (floor(2/2)=1)", () => {
    const group = makeGroup("CB", [3, 9]);
    const deltas = computeGameweekValueDeltas(group);
    expect(deltas.get("CB-0")).toBe(-0.5);
    expect(deltas.get("CB-1")).toBe(0.5);
  });

  it("plusieurs postes indépendants ne s'influencent pas entre eux", () => {
    const entries = [...makeGroup("GK", [1, 10]), ...makeGroup("RW", [4, 4])];
    const deltas = computeGameweekValueDeltas(entries);
    expect(deltas.get("GK-0")).toBe(-0.5);
    expect(deltas.get("GK-1")).toBe(0.5);
    expect(deltas.get("RW-0")).toBe(-0.5);
    expect(deltas.get("RW-1")).toBe(0.5);
  });

  it("step/topN/bottomN configurables", () => {
    const group = makeGroup("LB", [1, 2, 3, 4]);
    const deltas = computeGameweekValueDeltas(group, { step: 1.0, topN: 1, bottomN: 1 });
    expect(deltas.get("LB-0")).toBe(-1.0);
    expect(deltas.get("LB-3")).toBe(1.0);
    expect(deltas.has("LB-1")).toBe(false);
    expect(deltas.has("LB-2")).toBe(false);
  });

  it("config par défaut correspond aux valeurs actées avec l'utilisateur", () => {
    expect(DEFAULT_VALUE_ADJUSTMENT_CONFIG).toEqual({ step: 0.5, topN: 5, bottomN: 5 });
  });
});
