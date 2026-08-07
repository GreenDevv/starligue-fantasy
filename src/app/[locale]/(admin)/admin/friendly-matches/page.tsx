"use client";

// Saisie manuelle du résultat des matchs FriendlyMatch (Warm Up, Coupe de France,
// EHF CL/EL — ARCHITECTURE.md §19/§19.2) quand lnh.fr traîne à publier le score.
// Aucune stat joueur n'existe pour ces compétitions (vérifié, §19) — un score
// suffit, pas de boxscore à saisir. La saisie est protégée d'un écrasement par le
// prochain passage du cron sync-warmup (src/lib/ingestion/warmup.ts,
// syncFriendlyMatches) jusqu'à ce que lnh.fr publie lui-même un résultat définitif.
import { useState, useEffect } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { resolveApiError } from "@/lib/api/error-messages";

type FriendlyStatus = "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" | "CANCELLED";

interface FriendlyMatchRow {
  id: string;
  competitionLabel: string;
  kickoffAt: string;
  status: FriendlyStatus;
  homeClubName: string;
  awayClubName: string;
  homeScore: number | null;
  awayScore: number | null;
  source: string;
  needsResult: boolean;
}

function MatchRow({ match, onUpdated }: { match: FriendlyMatchRow; onUpdated: (m: FriendlyMatchRow) => void }) {
  const t = useTranslations("admin");
  const tRoot = useTranslations();
  const format = useFormatter();
  const [editing, setEditing] = useState(match.needsResult);
  const [homeScore, setHomeScore] = useState(match.homeScore != null ? String(match.homeScore) : "");
  const [awayScore, setAwayScore] = useState(match.awayScore != null ? String(match.awayScore) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canSave = homeScore.trim() !== "" && awayScore.trim() !== "" && Number(homeScore) >= 0 && Number(awayScore) >= 0;

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/friendly-matches/${match.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { data?: Partial<FriendlyMatchRow>; error?: { code?: string } };
      if (res.ok && json.data) {
        onUpdated({ ...match, ...json.data });
        setEditing(false);
      } else {
        setError(resolveApiError(tRoot, "admin", json.error?.code));
      }
    } catch {
      setError(t("common.networkError"));
    } finally {
      setSaving(false);
    }
  }

  async function clearOverride() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/friendly-matches/${match.id}`, { method: "DELETE" });
      const json = (await res.json()) as { data?: Partial<FriendlyMatchRow>; error?: { code?: string } };
      if (res.ok && json.data) {
        onUpdated({ ...match, ...json.data });
        setHomeScore("");
        setAwayScore("");
        setEditing(true);
      } else {
        setError(resolveApiError(tRoot, "admin", json.error?.code));
      }
    } catch {
      setError(t("common.networkError"));
    } finally {
      setSaving(false);
    }
  }

  const isManual = match.source === "MANUAL";

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
        <span>{match.competitionLabel}</span>
        <span>
          {format.dateTime(new Date(match.kickoffAt), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 flex-1 truncate text-sm text-text">{match.homeClubName}</span>
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              max={99}
              value={homeScore}
              onChange={(e) => setHomeScore(e.target.value)}
              className="w-12 rounded border border-border bg-bg px-2 py-1 text-center text-sm text-text focus:border-accent focus:outline-none"
            />
            <span className="text-text-muted">-</span>
            <input
              type="number"
              min={0}
              max={99}
              value={awayScore}
              onChange={(e) => setAwayScore(e.target.value)}
              className="w-12 rounded border border-border bg-bg px-2 py-1 text-center text-sm text-text focus:border-accent focus:outline-none"
            />
          </div>
        ) : (
          <span className="shrink-0 rounded bg-bg px-2 py-1 font-mono text-sm text-text">
            {match.status === "POSTPONED"
              ? t("friendlyMatches.postponedBadge")
              : match.status === "CANCELLED"
                ? t("friendlyMatches.cancelledBadge")
                : `${match.homeScore} - ${match.awayScore}`}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-right text-sm text-text">{match.awayClubName}</span>
      </div>

      {error && <p className="text-xs text-points-neg">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        {isManual ? (
          <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-accent">
            {t("friendlyMatches.manualBadge")}
          </span>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          {editing ? (
            <>
              <button onClick={() => patch({ status: "POSTPONED" })} disabled={saving} className="text-xs text-text-muted hover:text-text">
                {t("friendlyMatches.postponedButton")}
              </button>
              <button onClick={() => patch({ status: "CANCELLED" })} disabled={saving} className="text-xs text-text-muted hover:text-text">
                {t("friendlyMatches.cancelledButton")}
              </button>
              <button
                onClick={() => patch({ status: "FINISHED", homeScore: Number(homeScore), awayScore: Number(awayScore) })}
                disabled={!canSave || saving}
                className="rounded bg-accent px-3 py-1 text-xs font-semibold text-bg transition-opacity disabled:opacity-40"
              >
                {saving ? t("common.saving") : t("common.save")}
              </button>
            </>
          ) : (
            <>
              {isManual && (
                <button onClick={clearOverride} disabled={saving} className="text-xs text-text-muted hover:text-text">
                  {t("friendlyMatches.undoButton")}
                </button>
              )}
              <button onClick={() => setEditing(true)} className="text-xs text-accent hover:opacity-80">
                {t("friendlyMatches.editButton")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminFriendlyMatchesPage() {
  const t = useTranslations("admin");
  const [matches, setMatches] = useState<FriendlyMatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/friendly-matches");
    const json = (await res.json()) as { data?: { matches: FriendlyMatchRow[] } };
    if (json.data) setMatches(json.data.matches);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function handleUpdated(updated: FriendlyMatchRow) {
    setMatches((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
  }

  const pendingCount = matches.filter((m) => m.needsResult).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-wide text-text">{t("friendlyMatches.title")}</h1>
        <p className="mt-1 text-sm text-text-muted">{t("friendlyMatches.subtitle", { count: pendingCount })}</p>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-text-muted">{t("common.loading")}</div>
      ) : matches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-text-muted">
          {t("friendlyMatches.empty")}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {matches.map((m) => (
            <MatchRow key={m.id} match={m} onUpdated={handleUpdated} />
          ))}
        </div>
      )}
    </div>
  );
}
