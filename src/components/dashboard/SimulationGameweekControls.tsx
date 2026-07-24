"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
      const json = (await res.json()) as { error?: { message: string } };
      if (!res.ok) {
        setError(json.error?.message ?? "Erreur");
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
        {pending === "revert" ? "…" : "← Journée précédente"}
      </button>
      <span className="shrink-0 text-[10px] uppercase tracking-widest text-text-muted">
        Simu J{controls.gameweekNumber}/{controls.totalGameweeks}
      </span>
      <button
        onClick={() => trigger("advance")}
        disabled={atEnd || pending !== null}
        className="pixel-corners-sm border border-border px-2 py-1 text-[10px] text-text-muted transition-colors hover:border-accent/50 hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending === "advance" ? "…" : "Journée suivante →"}
      </button>
      {error && <p className="text-[10px] text-points-neg">{error}</p>}
    </div>
  );
}
