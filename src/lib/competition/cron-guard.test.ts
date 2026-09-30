import { describe, it, expect } from "vitest";
import { starligueOnlyCronSkip } from "./cron-guard";

describe("starligueOnlyCronSkip", () => {
  it("Starligue : le cron s'exécute normalement", () => {
    expect(starligueOnlyCronSkip("sync-live", "LNH")).toBeNull();
  });

  it("LBE : réponse 200 « ignoré », sans rien exécuter", async () => {
    const res = starligueOnlyCronSkip("sync-live", "LFH")!;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { skipped: true, reason: "sync-live : réservé au jeu Starligue, sans objet sur LBE Fantasy" },
    });
  });
});
