"use client";

// Gestion des matchs FriendlyMatch (Warm Up, Coupe de France, EHF CL/EL —
// ARCHITECTURE.md §19/§19.2/§19.6) : saisie manuelle du résultat quand lnh.fr
// traîne à publier le score (aucune stat joueur n'existe pour ces compétitions,
// vérifié §19 — un score suffit, pas de boxscore à saisir), et correction d'un
// match mal daté ou en doublon (§19.6 — lnh.fr republie parfois un match sous un
// nouveau calendars_id sans retirer l'ancien, laissant une ligne orpheline
// figée). Score/date manuels protégés d'un écrasement par le prochain passage du
// cron sync-warmup (src/lib/ingestion/warmup.ts, syncFriendlyMatches) jusqu'à ce
// que lnh.fr publie lui-même un résultat définitif.
import { useState, useEffect, useMemo } from "react";
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

// "2026-08-14T18:00" (heure locale du navigateur) — format attendu par un
// <input type="datetime-local">, à partir d'un ISO UTC.
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function DateEditor({ match, onSave, onCancel, saving }: { match: FriendlyMatchRow; onSave: (iso: string) => void; onCancel: () => void; saving: boolean }) {
  const t = useTranslations("admin");
  const [value, setValue] = useState(() => toDatetimeLocalValue(match.kickoffAt));

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="rounded border border-border bg-bg px-2 py-1 text-xs text-text focus:border-accent focus:outline-none"
      />
      <button
        onClick={() => onSave(new Date(value).toISOString())}
        disabled={saving}
        className="rounded bg-accent px-2 py-1 text-xs font-semibold text-bg transition-opacity disabled:opacity-40"
      >
        {t("common.save")}
      </button>
      <button onClick={onCancel} disabled={saving} className="text-xs text-text-muted hover:text-text">
        {t("common.cancel")}
      </button>
    </div>
  );
}

function MatchRow({ match, onUpdated, onDeleted }: { match: FriendlyMatchRow; onUpdated: (m: FriendlyMatchRow) => void; onDeleted: (id: string) => void }) {
  const t = useTranslations("admin");
  const tRoot = useTranslations();
  const format = useFormatter();
  const [editing, setEditing] = useState(match.needsResult);
  const [editingDate, setEditingDate] = useState(false);
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
        setEditingDate(false);
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

  // Suppression définitive de la ligne (prisma.friendlyMatch.delete, pas un
  // simple changement de statut) — partagée par le bouton "Supprimer
  // définitivement" (doublon/donnée erronée) ET le bouton "Annulé" (un match
  // annulé n'a plus aucune raison d'exister : le laisser en base avec
  // status=CANCELLED ne le retire d'aucun affichage — get-warmup-matches.ts
  // renvoie toutes les lignes sans filtrer sur le statut — donc restait visible,
  // "figé", exactement le symptôme signalé). Seul le message de confirmation
  // change selon le contexte.
  async function deletePermanently(confirmMessageKey: "confirmDeleteQuestion" | "confirmCancelQuestion") {
    if (!confirm(t(`friendlyMatches.${confirmMessageKey}`))) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/friendly-matches/${match.id}?hard=1`, { method: "DELETE" });
      const json = (await res.json()) as { data?: { deleted?: boolean }; error?: { code?: string } };
      if (res.ok && json.data?.deleted) {
        onDeleted(match.id);
      } else {
        setError(resolveApiError(tRoot, "admin", json.error?.code));
        setSaving(false);
      }
    } catch {
      setError(t("common.networkError"));
      setSaving(false);
    }
  }

  const isManual = match.source === "MANUAL";

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
        <span>{match.competitionLabel}</span>
        {editingDate ? (
          <DateEditor
            match={match}
            saving={saving}
            onCancel={() => setEditingDate(false)}
            onSave={(iso) => patch({ kickoffAt: iso })}
          />
        ) : (
          <button onClick={() => setEditingDate(true)} className="hover:text-text hover:underline">
            {format.dateTime(new Date(match.kickoffAt), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            {" · "}
            {t("friendlyMatches.editDateButton")}
          </button>
        )}
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
              <button onClick={() => deletePermanently("confirmCancelQuestion")} disabled={saving} className="text-xs text-text-muted hover:text-text">
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
              <button onClick={() => deletePermanently("confirmDeleteQuestion")} disabled={saving} className="text-xs text-points-neg hover:opacity-80">
                {t("friendlyMatches.deleteButton")}
              </button>
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
  // Par défaut "à traiter" (comportement historique) — "tous" sert à retrouver un
  // match mal daté ou en doublon (§19.6), qui n'a pas forcément besoin d'un score.
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");

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

  function handleDeleted(id: string) {
    setMatches((prev) => prev.filter((m) => m.id !== id));
  }

  const pendingCount = matches.filter((m) => m.needsResult).length;

  const visibleMatches = useMemo(() => {
    const base = showAll ? matches : matches.filter((m) => m.needsResult);
    const q = search.trim().toLowerCase();
    const filtered = q
      ? base.filter(
          (m) => m.homeClubName.toLowerCase().includes(q) || m.awayClubName.toLowerCase().includes(q) || m.competitionLabel.toLowerCase().includes(q)
        )
      : base;
    // "À traiter" : le plus ancien en retard d'abord (à régulariser en priorité).
    // "Tous" : le plus récent d'abord (déjà l'ordre renvoyé par l'API).
    return showAll ? filtered : [...filtered].reverse();
  }, [matches, showAll, search]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-wide text-text">{t("friendlyMatches.title")}</h1>
        <p className="mt-1 text-sm text-text-muted">{t("friendlyMatches.subtitle", { count: pendingCount })}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1 text-xs">
          <button
            onClick={() => setShowAll(false)}
            className={`rounded px-3 py-1.5 transition-colors ${!showAll ? "bg-accent text-bg font-semibold" : "text-text-muted hover:text-text"}`}
          >
            {t("friendlyMatches.filterPending")} ({pendingCount})
          </button>
          <button
            onClick={() => setShowAll(true)}
            className={`rounded px-3 py-1.5 transition-colors ${showAll ? "bg-accent text-bg font-semibold" : "text-text-muted hover:text-text"}`}
          >
            {t("friendlyMatches.filterAll")} ({matches.length})
          </button>
        </div>
        {showAll && (
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("friendlyMatches.searchPlaceholder")}
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        )}
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-text-muted">{t("common.loading")}</div>
      ) : matches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-text-muted">
          {t("friendlyMatches.empty")}
        </div>
      ) : visibleMatches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-text-muted">
          {t("friendlyMatches.noSearchResults")}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visibleMatches.map((m) => (
            <MatchRow key={m.id} match={m} onUpdated={handleUpdated} onDeleted={handleDeleted} />
          ))}
        </div>
      )}
    </div>
  );
}
