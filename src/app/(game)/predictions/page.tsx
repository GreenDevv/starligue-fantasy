"use client";

// Pronostics de journée — ARCHITECTURE.md §14. Client-only : /api/predictions
// résout déjà l'utilisateur (session) et la ligue active (cookie httpOnly) côté
// serveur, pas besoin de props initiales depuis un parent serveur.
import { useEffect, useState, useCallback } from "react";
import { ClubLogo } from "@/components/ui/ClubLogo";

type PredictionOutcome = "HOME" | "DRAW" | "AWAY";

const OUTCOME_ORDER: PredictionOutcome[] = ["HOME", "DRAW", "AWAY"];
const OUTCOME_LABELS: Record<PredictionOutcome, string> = {
  HOME: "Domicile",
  DRAW: "Nul",
  AWAY: "Extérieur",
};

interface ClubInfo {
  shortName: string;
  name: string;
  logoUrl: string | null;
}

interface MatchPrediction {
  matchId: string;
  kickoffAt: string;
  locked: boolean;
  homeClub: ClubInfo;
  awayClub: ClubInfo;
  odds: Record<PredictionOutcome, number> | null;
  myPick: PredictionOutcome | null;
}

function formatKickoff(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PredictionsPage() {
  const [gwNumber, setGwNumber] = useState<number | null>(null);
  // Journée la plus avancée ouverte aux pronostics (première dont la deadline
  // n'est pas encore passée) — sert à interdire de naviguer vers une journée
  // future tant que celle-ci n'est pas passée (§14.1).
  const [currentGwNumber, setCurrentGwNumber] = useState<number | null>(null);
  const [matches, setMatches] = useState<MatchPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null);

  const load = useCallback(async (gw?: number) => {
    setLoading(true);
    setError(null);
    try {
      const qs = gw ? `?gw=${gw}` : "";
      const res = await fetch(`/api/predictions${qs}`);
      const body = (await res.json()) as {
        data?: { gameweekNumber: number; currentGameweekNumber: number | null; matches: MatchPrediction[] };
        error?: { code: string; message: string };
      };
      if (body.data) {
        setGwNumber(body.data.gameweekNumber);
        setCurrentGwNumber(body.data.currentGameweekNumber);
        setMatches(body.data.matches);
      } else {
        setError(body.error?.message ?? "Impossible de charger les pronostics");
      }
    } catch {
      setError("Erreur réseau");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function pick(matchId: string, outcome: PredictionOutcome) {
    setPendingMatchId(matchId);
    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, outcome }),
      });
      const body = (await res.json()) as {
        data?: { matchId: string; outcome: PredictionOutcome };
        error?: { message: string };
      };
      if (body.data) {
        setMatches((prev) => prev.map((m) => (m.matchId === matchId ? { ...m, myPick: outcome } : m)));
      } else {
        setError(body.error?.message ?? "Pronostic impossible");
      }
    } catch {
      setError("Erreur réseau");
    }
    setPendingMatchId(null);
  }

  const nextGwBlocked = gwNumber !== null && currentGwNumber !== null && gwNumber >= currentGwNumber;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl text-text">Pronostics</h1>
        <p className="text-sm text-text-muted">
          Gratuit et illimité. Un bon pronostic booste le multiplicateur de tes points de la
          journée (×0.5 à ×2.0) — jamais de pénalité sur du négatif ni pour un pronostic non tenté.
        </p>
      </div>

      {gwNumber !== null && (
        <div className="flex flex-col gap-1">
          <div className="pixel-corners flex items-center justify-between border border-border bg-surface px-4 py-2.5">
            <button
              type="button"
              onClick={() => gwNumber > 1 && load(gwNumber - 1)}
              disabled={gwNumber <= 1}
              className="text-sm text-text-muted transition-colors hover:text-text disabled:opacity-30"
            >
              ← J{gwNumber > 1 ? gwNumber - 1 : ""}
            </button>
            <span className="font-display text-sm uppercase tracking-wide text-text">
              Journée {gwNumber}
            </span>
            <button
              type="button"
              onClick={() => !nextGwBlocked && load(gwNumber + 1)}
              disabled={nextGwBlocked}
              title={nextGwBlocked ? `Ouvre après la deadline de la journée ${gwNumber}` : undefined}
              className="text-sm text-text-muted transition-colors hover:text-text disabled:opacity-30"
            >
              J{gwNumber + 1} →
            </button>
          </div>
          {nextGwBlocked && (
            <p className="text-center text-[11px] text-text-muted">
              La journée {gwNumber + 1} s'ouvrira une fois la deadline de la journée {gwNumber} passée.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="pixel-corners-sm border border-points-neg/40 bg-points-neg/10 px-3 py-2 text-sm text-points-neg">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-text-muted">Chargement…</div>
      ) : matches.length === 0 ? (
        <div className="pixel-corners border border-border bg-surface px-4 py-8 text-center text-text-muted">
          Aucun match pour cette journée.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {matches.map((m) => (
            <div key={m.matchId} className="pixel-corners border border-border bg-surface p-3">
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
                  <p className="truncate text-sm text-text">{m.homeClub.shortName}</p>
                  <ClubLogo club={m.homeClub} size="sm" />
                </div>
                <span className="shrink-0 text-[10px] text-text-muted">{formatKickoff(m.kickoffAt)}</span>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <ClubLogo club={m.awayClub} size="sm" />
                  <p className="truncate text-sm text-text">{m.awayClub.shortName}</p>
                </div>
              </div>

              {m.locked ? (
                <p className="mt-2 text-center text-[10px] uppercase tracking-widest text-text-muted">
                  {m.myPick ? `Pronostic verrouillé : ${OUTCOME_LABELS[m.myPick]}` : "Verrouillé — aucun pronostic tenté"}
                </p>
              ) : !m.odds ? (
                <p className="mt-2 text-center text-[10px] text-text-muted">Cotes pas encore disponibles</p>
              ) : (
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {OUTCOME_ORDER.map((outcome) => {
                    const isPick = m.myPick === outcome;
                    return (
                      <button
                        key={outcome}
                        type="button"
                        disabled={pendingMatchId === m.matchId}
                        onClick={() => pick(m.matchId, outcome)}
                        className={[
                          "pixel-corners-sm flex flex-col items-center gap-0.5 border px-1 py-1.5 transition-colors",
                          isPick
                            ? "border-accent bg-accent/10 shadow-glow-accent"
                            : "border-border bg-bg hover:border-accent/40",
                          pendingMatchId === m.matchId ? "opacity-50" : "",
                        ].join(" ")}
                      >
                        <span className={`text-[9px] uppercase tracking-wide ${isPick ? "text-accent" : "text-text-muted"}`}>
                          {OUTCOME_LABELS[outcome]}
                        </span>
                        <span className={`font-arcade text-sm tabular-nums ${isPick ? "text-accent" : "text-text"}`}>
                          {m.odds![outcome].toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
