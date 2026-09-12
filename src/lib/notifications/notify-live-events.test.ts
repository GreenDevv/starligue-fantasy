import { describe, it, expect } from "vitest";
import { passesPlayerFilterForEvent, passesPlayerFilterForMatch } from "./notify-live-events";

function user(overrides: {
  onlyMyPlayers?: boolean;
  playerId?: string | null;
  playerClubId?: string | null;
  squadPlayerIds?: string[];
  squadClubIds?: string[];
}) {
  return {
    liveNotificationsOnlyMyPlayers: overrides.onlyMyPlayers ?? false,
    liveNotificationsPlayerId: overrides.playerId ?? null,
    liveNotificationsPlayer: overrides.playerClubId ? { clubId: overrides.playerClubId } : null,
    fantasyTeams: [
      {
        squad: (overrides.squadPlayerIds ?? []).map((playerId, i) => ({
          playerId,
          player: { clubId: overrides.squadClubIds?.[i] ?? "" },
        })),
      },
    ],
  };
}

describe("passesPlayerFilterForEvent", () => {
  it("laisse tout passer par défaut (pas de filtre joueur)", () => {
    expect(passesPlayerFilterForEvent(user({}), "p1")).toBe(true);
    expect(passesPlayerFilterForEvent(user({}), null)).toBe(true);
  });

  it("un seul joueur suivi : ne passe que ses événements", () => {
    const u = user({ playerId: "p1" });
    expect(passesPlayerFilterForEvent(u, "p1")).toBe(true);
    expect(passesPlayerFilterForEvent(u, "p2")).toBe(false);
    expect(passesPlayerFilterForEvent(u, null)).toBe(false);
  });

  it("seulement mes joueurs : ne passe que les événements d'un joueur de l'effectif", () => {
    const u = user({ onlyMyPlayers: true, squadPlayerIds: ["p1", "p2"] });
    expect(passesPlayerFilterForEvent(u, "p1")).toBe(true);
    expect(passesPlayerFilterForEvent(u, "p3")).toBe(false);
    expect(passesPlayerFilterForEvent(u, null)).toBe(false);
  });

  it("joueur unique prime sur onlyMyPlayers si jamais les deux sont vrais", () => {
    const u = user({ onlyMyPlayers: true, squadPlayerIds: ["p2"], playerId: "p1" });
    expect(passesPlayerFilterForEvent(u, "p1")).toBe(true);
    expect(passesPlayerFilterForEvent(u, "p2")).toBe(false);
  });
});

describe("passesPlayerFilterForMatch", () => {
  it("laisse tout passer par défaut", () => {
    expect(passesPlayerFilterForMatch(user({}), "home", "away")).toBe(true);
  });

  it("un seul joueur suivi : seulement s'il joue dans ce match", () => {
    const u = user({ playerId: "p1", playerClubId: "home" });
    expect(passesPlayerFilterForMatch(u, "home", "away")).toBe(true);
    expect(passesPlayerFilterForMatch(u, "other", "away")).toBe(false);
  });

  it("seulement mes joueurs : seulement si un joueur de l'effectif joue ce match", () => {
    const u = user({ onlyMyPlayers: true, squadPlayerIds: ["p1"], squadClubIds: ["home"] });
    expect(passesPlayerFilterForMatch(u, "home", "away")).toBe(true);
    expect(passesPlayerFilterForMatch(u, "other", "elsewhere")).toBe(false);
  });
});
