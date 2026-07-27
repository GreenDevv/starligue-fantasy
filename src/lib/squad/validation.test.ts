import { describe, it, expect } from "vitest";
import { validateSquad, validateLineup, POSITIONS, type SquadPlayer } from "./validation";

function makePlayer(
  id: string,
  position: SquadPlayer["position"],
  marketValue = 8.0,
  isActive = true,
  clubId = `club-${id}`, // unique par défaut : ne déclenche jamais TOO_MANY_PLAYERS_FROM_CLUB sans le vouloir
): SquadPlayer {
  return { id, position, marketValue, isActive, clubId };
}

/** Effectif valide par défaut : 2 joueurs par poste, total = 7×2×8 = 112 > 100 → ajusté */
function makeValidSquad(valuePerPlayer = 7.0): SquadPlayer[] {
  // 14 joueurs × 7.0 = 98.0 ≤ 100.0 ✓
  return POSITIONS.flatMap((pos, pi) => [
    makePlayer(`${pos}-1`, pos, valuePerPlayer),
    makePlayer(`${pos}-2`, pos, valuePerPlayer),
  ]);
}

describe("validateSquad — cas valides", () => {
  it("effectif parfait → valide", () => {
    expect(validateSquad(makeValidSquad()).valid).toBe(true);
  });

  it("budget exact (100.0) → valide", () => {
    // 14 joueurs × ~7.14 ≈ 100 — utilisons 14 × 7.1 = 99.4
    expect(validateSquad(makeValidSquad(7.1)).valid).toBe(true);
  });
});

describe("validateSquad — erreurs de taille", () => {
  it("effectif de 13 joueurs → WRONG_SQUAD_SIZE", () => {
    const squad = makeValidSquad().slice(0, 13);
    const result = validateSquad(squad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "WRONG_SQUAD_SIZE")).toBe(true);
  });

  it("effectif de 15 joueurs → WRONG_SQUAD_SIZE", () => {
    const squad = [...makeValidSquad(), makePlayer("extra", "GK")];
    const result = validateSquad(squad);
    expect(result.errors.some((e) => e.code === "WRONG_SQUAD_SIZE")).toBe(true);
  });
});

describe("validateSquad — erreurs de poste", () => {
  it("3 GK au lieu de 2 → WRONG_COUNT_AT_POSITION (GK) + WRONG_SQUAD_SIZE", () => {
    const squad = makeValidSquad();
    // Remplace un LW-1 par un 3e GK
    squad[2] = makePlayer("GK-3", "GK");
    const result = validateSquad(squad);
    expect(result.errors.some((e) => e.code === "WRONG_COUNT_AT_POSITION" && e.position === "GK")).toBe(true);
    expect(result.errors.some((e) => e.code === "WRONG_COUNT_AT_POSITION" && e.position === "LW")).toBe(true);
  });

  it("0 PV → WRONG_COUNT_AT_POSITION (PV)", () => {
    // Remplace les 2 PV par des GK supplémentaires
    const squad = makeValidSquad().map((p) =>
      p.position === "PV" ? { ...p, position: "GK" as const } : p,
    );
    const result = validateSquad(squad);
    expect(result.errors.some((e) => e.code === "WRONG_COUNT_AT_POSITION" && e.position === "PV")).toBe(true);
    expect(result.errors.some((e) => e.code === "WRONG_COUNT_AT_POSITION" && e.position === "GK")).toBe(true);
  });
});

describe("validateSquad — budget", () => {
  it("total > budget → BUDGET_EXCEEDED", () => {
    const squad = makeValidSquad(8.0); // 14 × 8.0 = 112 > 100
    const result = validateSquad(squad);
    expect(result.errors.some((e) => e.code === "BUDGET_EXCEEDED")).toBe(true);
  });

  it("total = 100.0 → valide", () => {
    // 14 × 7.142... → arrondi : utilisons 7.1 × 14 = 99.4
    expect(validateSquad(makeValidSquad(7.1)).valid).toBe(true);
  });
});

describe("validateSquad — joueurs inactifs / doublons", () => {
  it("joueur inactif → INACTIVE_PLAYER", () => {
    const squad = makeValidSquad();
    squad[0] = { ...squad[0]!, isActive: false };
    const result = validateSquad(squad);
    expect(result.errors.some((e) => e.code === "INACTIVE_PLAYER")).toBe(true);
  });

  it("doublon → DUPLICATE_PLAYER", () => {
    const squad = makeValidSquad();
    squad[1] = { ...squad[0]! }; // même id que squad[0]
    const result = validateSquad(squad);
    expect(result.errors.some((e) => e.code === "DUPLICATE_PLAYER")).toBe(true);
  });
});

describe("validateSquad — max joueurs par club", () => {
  it("3 joueurs du même club → valide (limite par défaut)", () => {
    const squad = makeValidSquad();
    squad[0] = { ...squad[0]!, clubId: "same-club" };
    squad[1] = { ...squad[1]!, clubId: "same-club" };
    squad[2] = { ...squad[2]!, clubId: "same-club" };
    expect(validateSquad(squad).valid).toBe(true);
  });

  it("4 joueurs du même club → TOO_MANY_PLAYERS_FROM_CLUB", () => {
    const squad = makeValidSquad();
    squad[0] = { ...squad[0]!, clubId: "same-club" };
    squad[1] = { ...squad[1]!, clubId: "same-club" };
    squad[2] = { ...squad[2]!, clubId: "same-club" };
    squad[3] = { ...squad[3]!, clubId: "same-club" };
    const result = validateSquad(squad);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.code === "TOO_MANY_PLAYERS_FROM_CLUB" && e.clubId === "same-club" && e.count === 4),
    ).toBe(true);
  });

  it("limite personnalisée (maxPlayersPerClub: 2) → 3 du même club invalide", () => {
    const squad = makeValidSquad();
    squad[0] = { ...squad[0]!, clubId: "same-club" };
    squad[1] = { ...squad[1]!, clubId: "same-club" };
    squad[2] = { ...squad[2]!, clubId: "same-club" };
    const result = validateSquad(squad, { playersPerPosition: 2, budget: 100.0, maxPlayersPerClub: 2 });
    expect(result.errors.some((e) => e.code === "TOO_MANY_PLAYERS_FROM_CLUB")).toBe(true);
  });
});

// ---------------------------------------------------------------------------

function makeValidLineup() {
  // 7 titulaires (1/poste) + 7 remplaçants
  const starters = POSITIONS.map((pos) => ({ id: `${pos}-1`, position: pos, isStarter: true }));
  const bench = POSITIONS.map((pos) => ({ id: `${pos}-2`, position: pos, isStarter: false }));
  return [...starters, ...bench];
}

function makeSquadIds() {
  return new Set(POSITIONS.flatMap((pos) => [`${pos}-1`, `${pos}-2`]));
}

describe("validateLineup — cas valides", () => {
  it("7 titulaires (1/poste) + 7 remplaçants → valide", () => {
    expect(validateLineup(makeValidLineup(), makeSquadIds()).valid).toBe(true);
  });
});

describe("validateLineup — erreurs de titulaires", () => {
  it("2 GK titulaires → WRONG_STARTERS_AT_POSITION (GK)", () => {
    const lineup = makeValidLineup().map((p) =>
      p.id === "LW-1" ? { ...p, position: "GK" as const } : p,
    );
    const result = validateLineup(lineup, makeSquadIds());
    expect(result.errors.some((e) => e.code === "WRONG_STARTERS_AT_POSITION" && e.position === "GK")).toBe(true);
  });

  it("0 titulaires → WRONG_LINEUP_SIZE", () => {
    const lineup = makeValidLineup().map((p) => ({ ...p, isStarter: false }));
    const result = validateLineup(lineup, makeSquadIds());
    expect(result.errors.some((e) => e.code === "WRONG_LINEUP_SIZE")).toBe(true);
  });
});

describe("validateLineup — joueurs hors effectif", () => {
  it("joueur absent de l'effectif → PLAYER_NOT_IN_SQUAD", () => {
    const lineup = [...makeValidLineup(), { id: "unknown-99", position: "GK" as const, isStarter: false }];
    const result = validateLineup(lineup, makeSquadIds());
    expect(result.errors.some((e) => e.code === "PLAYER_NOT_IN_SQUAD")).toBe(true);
  });
});
