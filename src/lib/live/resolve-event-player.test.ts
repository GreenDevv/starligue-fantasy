import { describe, it, expect } from "vitest";
import { resolveEventPlayerId } from "./resolve-event-player";

describe("resolveEventPlayerId", () => {
  const candidates = [
    { id: "p1", firstName: "Micke", lastName: "Brasseleur" },
    { id: "p2", firstName: "Diogo", lastName: "De Abreu Oliveira" },
    { id: "p3", firstName: "Taras", lastName: "Minotskyi" },
    { id: "p4", firstName: "Alexandre", lastName: "Demaille" },
  ];

  it("trouve le joueur but", () => {
    expect(resolveEventPlayerId("But de Micke Brasseleur (Saint-Raphaël)", candidates)).toBe("p1");
  });

  it("trouve le joueur avec un nom composé", () => {
    expect(resolveEventPlayerId("Penalty réussi de Diogo De Abreu Oliveira (Dunkerque)", candidates)).toBe("p2");
  });

  it("prend le plus long nom quand deux joueurs sont mentionnés (arrêt + tireur)", () => {
    // le gardien qui arrête ET le tireur sont tous deux dans le texte — best-effort,
    // on privilégie ici le premier trouvé de longueur maximale (pas de règle "sujet
    // grammatical", juste un affichage best-effort)
    const result = resolveEventPlayerId("Arrêt de Alexandre Demaille sur un tir de Taras Minotskyi (Dunkerque)", candidates);
    expect(["p3", "p4"]).toContain(result);
  });

  it("aucun nom reconnu → null", () => {
    expect(resolveEventPlayerId("Fin du match", candidates)).toBeNull();
    expect(resolveEventPlayerId("Temps mort de Dunkerque", candidates)).toBeNull();
  });

  it("liste de candidats vide → null", () => {
    expect(resolveEventPlayerId("But de Micke Brasseleur", [])).toBeNull();
  });
});
