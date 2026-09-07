"use client";

// Carte « score provisoire » de la journée en cours pour l'équipe de l'utilisateur
// (« Centre live », Lot 3). Se fetch elle-même, s'auto-rafraîchit toutes les ~40 s,
// se cache (rend null) tant qu'aucun match de la journée n'a ses notes.
import { useCallback, useEffect, useRef, useState } from "react";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { PositionBadge } from "@/components/ui/Badge";
import type { Position } from "@/lib/squad/validation";

interface PlayerRow {
  playerId: string;
  firstName: string;
  lastName: string;
  position: string;
  role: "STARTER" | "BENCH";
  club: { shortName: string; logoUrl: string | null };
  isCaptain: boolean;
  points: number | null;
}
interface Score {
  gameweekNumber: number;
  matchesWithResults: number;
  matchesTotal: number;
  provisionalTotal: number;
  players: PlayerRow[];
}

const REFRESH_MS = 40_000;
const fmt = (n: number) => (n > 0 ? `+${n}` : String(n));

export function LiveTeamScoreCard() {
  const [score, setScore] = useState<Score | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/team/live-score", { cache: "no-store" });
      if (res.status === 204 || res.status === 401) {
        setScore(null);
        return;
      }
      const json = (await res.json()) as { data?: Score };
      if (json.data) setScore(json.data);
    } catch {
      /* on garde le dernier état */
    }
  }, []);

  useEffect(() => {
    void load();
    timer.current = window.setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [load]);

  if (!score) return null;

  const positive = score.provisionalTotal >= 0;
  const starters = score.players.filter((p) => p.role === "STARTER");

  return (
    <div className="pixel-corners border border-accent/50 bg-surface">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-points-pos opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-points-pos" />
            </span>
            <p className="text-xs uppercase tracking-widest text-accent">Score en direct</p>
          </div>
          <p className="mt-0.5 text-sm text-text-muted">
            Journée {score.gameweekNumber} · {score.matchesWithResults}/{score.matchesTotal} matchs
          </p>
        </div>
        <p
          className={`font-arcade text-4xl leading-none drop-shadow-[0_0_8px_currentColor] ${
            positive ? "text-points-pos" : "text-points-neg"
          }`}
        >
          {fmt(score.provisionalTotal)}
        </p>
      </div>

      <p className="border-t border-border px-4 py-2 text-[11px] leading-snug text-text-muted">
        Points bruts d'effectif, hors bonus de journée, pronostics et bonus de victoire. Total définitif calculé en fin
        de journée.
      </p>

      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full border-t border-border px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted transition-colors hover:text-text"
      >
        {open ? "Masquer les joueurs" : "Voir les joueurs"}
      </button>

      {open && (
        <div className="border-t border-border">
          {score.players.map((p, i) => (
            <div
              key={p.playerId}
              className={`flex items-center gap-2 px-4 py-2 text-xs ${
                i === starters.length && score.players.length > starters.length ? "border-t border-border" : ""
              } ${p.role === "BENCH" ? "opacity-70" : ""}`}
            >
              <span className="min-w-0 flex-1 truncate font-medium text-text">
                {p.firstName.charAt(0)}. {p.lastName}
                {p.isCaptain && <span className="ml-1 text-accent-secondary">(C)</span>}
              </span>
              <ClubLogo club={p.club} size="xs" />
              <PositionBadge position={p.position as Position} />
              <span
                className={`w-12 shrink-0 text-right font-arcade text-sm ${
                  p.points === null
                    ? "text-text-muted/40"
                    : p.points === 0
                      ? "text-text-muted"
                      : p.points > 0
                        ? "text-points-pos"
                        : "text-points-neg"
                }`}
              >
                {p.points === null ? "—" : fmt(p.points)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
