"use client";

// Pronostics de journée — ARCHITECTURE.md §14. Client-only : /api/predictions
// résout déjà l'utilisateur (session) et la ligue active (cookie httpOnly) côté
// serveur, pas besoin de props initiales depuis un parent serveur.
import { useEffect, useState, useCallback } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { resolveApiError } from "@/lib/api/error-messages";

type PredictionOutcome = "HOME" | "DRAW" | "AWAY";

const OUTCOME_ORDER: PredictionOutcome[] = ["HOME", "DRAW", "AWAY"];

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

export default function PredictionsPage() {
  const t = useTranslations("predictions");
  const tLabels = useTranslations("labels");
  const tRoot = useTranslations();
  const format = useFormatter();

  const [gwNumber, setGwNumber] = useState<number | null>(null);
  // Journée la plus avancée ouverte aux pronostics (première dont la deadline
  // n'est pas encore passée) — sert à interdire de naviguer vers une journée
  // future tant que celle-ci n'est pas passée (§14.1).
  const [currentGwNumber, setCurrentGwNumber] = useState<number | null>(null);
  const [matches, setMatches] = useState<MatchPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null);

  const load = useCallback(
    async (gw?: number) => {
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
          setError(resolveApiError(tRoot, "predictions", body.error?.code));
        }
      } catch {
        setError(t("networkError"));
      }
      setLoading(false);
    },
    [t, tRoot]
  );

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
        error?: { code: string; message: string };
      };
      if (body.data) {
        setMatches((prev) => prev.map((m) => (m.matchId === matchId ? { ...m, myPick: outcome } : m)));
      } else {
        setError(resolveApiError(tRoot, "predictions", body.error?.code));
      }
    } catch {
      setError(t("networkError"));
    }
    setPendingMatchId(null);
  }

  const nextGwBlocked = gwNumber !== null && currentGwNumber !== null && gwNumber >= currentGwNumber;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl text-text">{t("title")}</h1>
        <p className="text-sm text-text-muted">{t("subtitle")}</p>
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
              ← {t("gwShort", { number: gwNumber > 1 ? String(gwNumber - 1) : "" })}
            </button>
            <span className="font-display text-sm uppercase tracking-wide text-text">
              {t("gwLabel", { number: gwNumber })}
            </span>
            <button
              type="button"
              onClick={() => !nextGwBlocked && load(gwNumber + 1)}
              disabled={nextGwBlocked}
              title={nextGwBlocked ? t("opensAfterDeadline", { number: gwNumber }) : undefined}
              className="text-sm text-text-muted transition-colors hover:text-text disabled:opacity-30"
            >
              {t("gwShort", { number: String(gwNumber + 1) })} →
            </button>
          </div>
          {nextGwBlocked && (
            <p className="text-center text-[11px] text-text-muted">
              {t("nextGwLocked", { next: gwNumber + 1, current: gwNumber })}
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
        <div className="py-8 text-center text-text-muted">{t("loading")}</div>
      ) : matches.length === 0 ? (
        <div className="pixel-corners border border-border bg-surface px-4 py-8 text-center text-text-muted">
          {t("noMatches")}
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
                <span className="shrink-0 text-[10px] text-text-muted">
                  {format.dateTime(new Date(m.kickoffAt), {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <ClubLogo club={m.awayClub} size="sm" />
                  <p className="truncate text-sm text-text">{m.awayClub.shortName}</p>
                </div>
              </div>

              {m.locked ? (
                <p className="mt-2 text-center text-[10px] uppercase tracking-widest text-text-muted">
                  {m.myPick
                    ? t("lockedWithPick", { outcome: tLabels(`predictionOutcome.${m.myPick}`) })
                    : t("lockedNoPick")}
                </p>
              ) : !m.odds ? (
                <p className="mt-2 text-center text-[10px] text-text-muted">{t("oddsUnavailable")}</p>
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
                          {tLabels(`predictionOutcome.${outcome}`)}
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
