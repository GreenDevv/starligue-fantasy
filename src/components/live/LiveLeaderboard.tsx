"use client";

// Classement général fantasy PROVISOIRE de la journée en cours (« Centre live »).
// S'auto-rafraîchit toutes les ~40 s tant qu'il y a des données ; se cache tout
// seul (rend null) hors journée en cours / sans match noté.
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

interface LiveRow {
  teamId: string;
  teamName: string;
  userName: string | null;
  leagueName: string;
  cumulativeBefore: number;
  provisionalGwPoints: number;
  provisionalTotal: number;
  globalRank: number;
  globalDelta: number | null;
}
interface LiveBoard {
  gameweekNumber: number;
  matchesWithResults: number;
  matchesTotal: number;
  updatedAt: string;
  rows: LiveRow[];
}

const REFRESH_MS = 40_000;

function Delta({ d }: { d: number | null }) {
  if (d === null) return <span className="w-8 shrink-0" />;
  if (d === 0)
    return <span className="w-8 shrink-0 text-center text-xs text-text-muted/60">=</span>;
  const up = d > 0;
  return (
    <span
      className={`w-8 shrink-0 text-center text-xs font-semibold ${up ? "text-points-pos" : "text-points-neg"}`}
      title={`${up ? "+" : ""}${d} place${Math.abs(d) > 1 ? "s" : ""} depuis la dernière journée`}
    >
      {up ? "▲" : "▼"}
      {Math.abs(d)}
    </span>
  );
}

export function LiveLeaderboard({ limit = 30 }: { limit?: number }) {
  const { data: session } = useSession();
  const [board, setBoard] = useState<LiveBoard | null>(null);
  const [ageSec, setAgeSec] = useState(0);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/leaderboard/live", { cache: "no-store" });
      if (res.status === 204) {
        setBoard(null);
        return;
      }
      const json = (await res.json()) as { data?: LiveBoard };
      if (json.data) setBoard(json.data);
    } catch {
      /* réseau : on garde le dernier état */
    }
  }, []);

  useEffect(() => {
    void load();
    timer.current = window.setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => {
    if (!board) return;
    const tick = () => setAgeSec(Math.max(0, Math.round((Date.now() - new Date(board.updatedAt).getTime()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [board]);

  if (!board || board.rows.length === 0) return null;

  const rows = board.rows.slice(0, limit);

  return (
    <div className="pixel-corners border border-accent/50 bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-points-pos opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-points-pos" />
          </span>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Classement en direct</p>
        </div>
        <p className="text-[11px] text-text-muted">
          Journée {board.gameweekNumber} · {board.matchesWithResults}/{board.matchesTotal} matchs · màj il y a {ageSec}s
        </p>
      </div>

      <p className="border-b border-border px-4 py-2 text-[11px] leading-snug text-text-muted">
        Total provisoire : cumul des journées notées + points bruts d'effectif de la journée en cours. Hors bonus de
        journée, pronostics et bonus de victoire — le classement définitif est calculé en fin de journée.
      </p>

      <ol className="divide-y divide-border">
        {rows.map((r) => {
          const isMine = Boolean(
            session?.user?.name && r.userName && r.userName.toLowerCase() === session.user.name.toLowerCase(),
          );
          return (
            <li
              key={r.teamId}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm ${isMine ? "bg-accent/10" : ""}`}
            >
              <span className="w-7 shrink-0 text-right font-arcade text-text-muted">{r.globalRank}</span>
              <Delta d={r.globalDelta} />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-text">{r.userName ?? r.teamName}</span>
                {r.leagueName && <span className="ml-2 text-xs text-text-muted">· {r.leagueName}</span>}
              </span>
              <span className="shrink-0 text-right">
                <span
                  className={`font-arcade text-base leading-none ${
                    r.provisionalGwPoints >= 0 ? "text-points-pos" : "text-points-neg"
                  }`}
                >
                  {r.provisionalGwPoints >= 0 ? "+" : ""}
                  {r.provisionalGwPoints}
                </span>
                <span className="ml-2 font-arcade text-sm text-text-muted">{r.provisionalTotal}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
