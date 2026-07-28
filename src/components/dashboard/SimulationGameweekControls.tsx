"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { resolveApiError } from "@/lib/api/error-messages";

// Contrôle admin de la progression de la saison simulée (avance/recule TOUTES les
// SimulationTeam à la fois) — au niveau du titre Dashboard, pas dans un widget en
// particulier : c'est un curseur unique et partagé (Season.currentSimulationGameweekNumber),
// pas une action scopée à une petite ligue créée par un joueur.
// Voir src/lib/simulation/admin-advance.ts.
export interface SimulationAdminControls {
  gameweekNumber: number;
  totalGameweeks: number;
}

export function SimulationGameweekControls({ controls }: { controls: SimulationAdminControls }) {
  const t = useTranslations();
  const tDashboard = useTranslations("dashboard");
  const router = useRouter();
  const [pending, setPending] = useState<"advance" | "revert" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function trigger(direction: "advance" | "revert") {
    setPending(direction);
    setError(null);
    try {
      const path =
        direction === "advance" ? "/api/admin/simulation/advance-gameweek" : "/api/admin/simulation/revert-gameweek";
      const res = await fetch(path, { method: "POST" });
      const json = (await res.json()) as { error?: { code?: string; message: string } };
      if (!res.ok) {
        setError(resolveApiError(t, "dashboard", json.error?.code));
        return;
      }
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(null);
    }
  }

  const atStart = controls.gameweekNumber <= 0;
  const atEnd = controls.gameweekNumber >= controls.totalGameweeks;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => trigger("revert")}
        disabled={atStart || pending !== null}
        className="pixel-corners-sm border border-border px-2 py-1 text-[10px] text-text-muted transition-colors hover:border-accent/50 hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending === "revert" ? "…" : tDashboard("simulationControls.prevGameweek")}
      </button>
      <span className="shrink-0 text-[10px] uppercase tracking-widest text-text-muted">
        {tDashboard("simulationControls.counter", {
          current: controls.gameweekNumber,
          total: controls.totalGameweeks,
        })}
      </span>
      <button
        onClick={() => trigger("advance")}
        disabled={atEnd || pending !== null}
        className="pixel-corners-sm border border-border px-2 py-1 text-[10px] text-text-muted transition-colors hover:border-accent/50 hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending === "advance" ? "…" : tDashboard("simulationControls.nextGameweek")}
      </button>
      {error && <p className="text-[10px] text-points-neg">{error}</p>}
    </div>
  );
}
