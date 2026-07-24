"use client";

import { useState, useEffect } from "react";
import { LeaderboardList } from "@/components/leaderboard/LeaderboardList";
import { useSession } from "next-auth/react";

interface StandingEntry {
  rank: number;
  teamId: string;
  teamName: string;
  userId: string;
  userName: string;
  totalPoints?: number;
  points?: number;
  jerseyConfig?: unknown;
  leagueName?: string;
}

interface GlobalData {
  standings: StandingEntry[];
  total: number;
  page: number;
  perPage: number;
}

interface GameweekData {
  gameweekNumber: number;
  isScored: boolean;
  standings: StandingEntry[];
}

export default function LeaderboardPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<"global" | "gameweek">("global");
  const [globalData, setGlobalData] = useState<GlobalData | null>(null);
  const [gwData, setGwData] = useState<GameweekData | null>(null);
  const [gwNumber, setGwNumber] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Load global leaderboard
  useEffect(() => {
    setLoading(true);
    fetch(`/api/leaderboard?page=${page}&perPage=20`)
      .then((r) => r.json())
      .then((data: { data?: GlobalData }) => {
        if (data.data) setGlobalData(data.data);
        setLoading(false);
      });
  }, [page]);

  // Load current gameweek number for default
  useEffect(() => {
    if (tab !== "gameweek") return;
    if (gwNumber !== null) return;
    fetch("/api/gameweeks/current")
      .then((r) => r.json())
      .then((data: { data?: { number: number } | null }) => {
        const num = data.data?.number ?? 1;
        setGwNumber(num);
      });
  }, [tab, gwNumber]);

  // Load gameweek standings
  useEffect(() => {
    if (tab !== "gameweek" || gwNumber === null) return;
    setLoading(true);
    fetch(`/api/leaderboard/gameweek/${gwNumber}`)
      .then((r) => r.json())
      .then((data: { data?: GameweekData }) => {
        if (data.data) setGwData(data.data);
        setLoading(false);
      });
  }, [tab, gwNumber]);

  const currentUserId = session?.user?.id;
  const totalPages = globalData ? Math.ceil(globalData.total / globalData.perPage) : 1;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl text-text">Classement</h1>

      {/* Tabs */}
      <div className="pixel-corners flex gap-1 border border-border bg-surface p-1">
        {(["global", "gameweek"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setLoading(true); }}
            className={[
              "pixel-corners-sm flex-1 py-1.5 text-sm font-semibold uppercase tracking-wide transition-colors",
              tab === t ? "bg-accent text-bg shadow-glow-accent" : "text-text-muted hover:text-text",
            ].join(" ")}
          >
            {t === "global" ? "Général" : "Cette journée"}
          </button>
        ))}
      </div>

      {/* Global tab */}
      {tab === "global" && (
        <div className="flex flex-col gap-3">
          {loading ? (
            <div className="py-10 text-center text-text-muted">Chargement…</div>
          ) : (
            <>
              {globalData && (
                <>
                  <p className="text-xs text-text-muted">
                    {globalData.total} équipe{globalData.total > 1 ? "s" : ""} au total
                  </p>
                  <LeaderboardList
                    entries={globalData.standings}
                    currentUserId={currentUserId}
                    pointsKey="totalPoints"
                  />
                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="pixel-corners-sm border border-border px-3 py-1 text-xs uppercase tracking-wide text-text-muted disabled:opacity-30 hover:text-text"
                      >
                        ← Préc.
                      </button>
                      <span className="font-arcade text-base tracking-wide text-text-muted">
                        {page} / {totalPages}
                      </span>
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="pixel-corners-sm border border-border px-3 py-1 text-xs uppercase tracking-wide text-text-muted disabled:opacity-30 hover:text-text"
                      >
                        Suiv. →
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Gameweek tab */}
      {tab === "gameweek" && (
        <div className="flex flex-col gap-3">
          {/* Gameweek selector */}
          {gwNumber !== null && (
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setGwNumber((n) => Math.max(1, (n ?? 1) - 1))}
                disabled={gwNumber <= 1}
                className="pixel-corners-sm border border-border px-3 py-1 text-sm text-text-muted disabled:opacity-30 hover:text-text"
              >
                ←
              </button>
              <span className="font-arcade text-lg tracking-wide text-text">
                Journée {gwNumber}
              </span>
              <button
                onClick={() => setGwNumber((n) => (n ?? 1) + 1)}
                className="pixel-corners-sm border border-border px-3 py-1 text-sm text-text-muted hover:text-text"
              >
                →
              </button>
            </div>
          )}

          {loading ? (
            <div className="py-10 text-center text-text-muted">Chargement…</div>
          ) : gwData ? (
            <>
              {!gwData.isScored && (
                <p className="text-center text-xs text-text-muted">
                  Journée non encore scorée
                </p>
              )}
              <LeaderboardList
                entries={gwData.standings}
                currentUserId={currentUserId}
                pointsKey="points"
              />
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
