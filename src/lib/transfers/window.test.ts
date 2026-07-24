import { describe, it, expect } from "vitest";
import { isLiveTransferWindowOpen, isSimulationTransferWindowOpen } from "./window";

describe("isLiveTransferWindowOpen", () => {
  const window = { opensAt: new Date("2026-12-20T00:00:00Z"), closesAt: new Date("2027-01-05T23:59:59Z") };

  it("avant l'ouverture → fermée", () => {
    expect(isLiveTransferWindowOpen(window, new Date("2026-12-19T23:00:00Z"))).toBe(false);
  });

  it("pendant la fenêtre → ouverte", () => {
    expect(isLiveTransferWindowOpen(window, new Date("2026-12-25T12:00:00Z"))).toBe(true);
  });

  it("aux bornes exactes → ouverte (inclusif)", () => {
    expect(isLiveTransferWindowOpen(window, window.opensAt)).toBe(true);
    expect(isLiveTransferWindowOpen(window, window.closesAt)).toBe(true);
  });

  it("après la fermeture → fermée", () => {
    expect(isLiveTransferWindowOpen(window, new Date("2027-01-06T00:00:01Z"))).toBe(false);
  });
});

describe("isSimulationTransferWindowOpen", () => {
  // Calendrier avec une vraie trêve : GW15 (18 déc) puis GW16 (10 jan), rien entre les deux.
  const gameweeks = [
    { number: 14, deadlineAt: new Date("2025-12-11T00:00:00Z") },
    { number: 15, deadlineAt: new Date("2025-12-18T00:00:00Z") },
    { number: 16, deadlineAt: new Date("2026-01-10T00:00:00Z") },
    { number: 17, deadlineAt: new Date("2026-01-17T00:00:00Z") },
  ];
  const noel = { opensAt: new Date("2025-12-20T00:00:00Z"), closesAt: new Date("2026-01-05T00:00:00Z") };

  it("équipe pas encore arrivée à la trêve (GW14 joué) → fermée", () => {
    expect(isSimulationTransferWindowOpen(noel, gameweeks, 14)).toBe(false);
  });

  it("équipe vient de terminer GW15 (juste avant la trêve) → ouverte", () => {
    expect(isSimulationTransferWindowOpen(noel, gameweeks, 15)).toBe(true);
  });

  it("équipe a avancé sur GW16 (après la trêve) → fermée", () => {
    expect(isSimulationTransferWindowOpen(noel, gameweeks, 16)).toBe(false);
  });

  it("saison sans trou (calendrier hebdo strict) → fenêtre ouverte sur exactement une journée", () => {
    const tightGameweeks = [
      { number: 1, deadlineAt: new Date("2025-12-14T00:00:00Z") },
      { number: 2, deadlineAt: new Date("2025-12-21T00:00:00Z") },
      { number: 3, deadlineAt: new Date("2025-12-28T00:00:00Z") },
    ];
    const shortWindow = { opensAt: new Date("2025-12-19T00:00:00Z"), closesAt: new Date("2025-12-20T00:00:00Z") };
    expect(isSimulationTransferWindowOpen(shortWindow, tightGameweeks, 1)).toBe(true);
    expect(isSimulationTransferWindowOpen(shortWindow, tightGameweeks, 2)).toBe(false);
  });

  it("closesAt au-delà de la dernière journée de la saison → reste ouverte indéfiniment une fois atteinte", () => {
    const lateWindow = { opensAt: new Date("2026-01-16T00:00:00Z"), closesAt: new Date("2099-01-01T00:00:00Z") };
    expect(isSimulationTransferWindowOpen(lateWindow, gameweeks, 17)).toBe(true);
    expect(isSimulationTransferWindowOpen(lateWindow, gameweeks, 100)).toBe(true);
  });

  it("avant la première journée de la saison, fenêtre ouverte dès le départ (currentGameweekNumber=0)", () => {
    const preSeasonWindow = { opensAt: new Date("2025-08-01T00:00:00Z"), closesAt: new Date("2025-08-15T00:00:00Z") };
    expect(isSimulationTransferWindowOpen(preSeasonWindow, gameweeks, 0)).toBe(true);
  });
});
