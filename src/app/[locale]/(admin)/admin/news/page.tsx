"use client";

import { useState, useEffect } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { resolveApiError } from "@/lib/api/error-messages";

interface NewsRow {
  id: string;
  title: string;
  category: string;
  sourceType: string;
  sourceKey: string;
  sourceUrl: string | null;
  publishedAt: string;
  club: string | null;
  player: string | null;
}

interface SourceSummary {
  fetched: number;
  inserted: number;
  duplicates: number;
  tooOld: number;
  error: string | null;
}

interface ClubOption {
  id: string;
  shortName: string;
}

interface PlayerOption {
  id: string;
  firstName: string;
  lastName: string;
  club: { shortName: string };
}

const CREATABLE_CATEGORIES = ["GENERAL", "TRANSFER", "INJURY"] as const;

const EMPTY_FORM = {
  category: "GENERAL" as (typeof CREATABLE_CATEGORIES)[number],
  title: "",
  excerpt: "",
  content: "",
  imageUrl: "",
  sourceUrl: "",
  clubId: "",
  playerId: "",
};

export default function AdminNewsPage() {
  const t = useTranslations("admin");
  const tLabels = useTranslations("labels");
  const tRoot = useTranslations();
  const format = useFormatter();
  const [news, setNews] = useState<NewsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<Record<string, SourceSummary> | null>(null);
  const [syncError, setSyncError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [clubs, setClubs] = useState<ClubOption[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/news");
    const json = (await res.json()) as { data?: { news: NewsRow[] } };
    if (json.data?.news) setNews(json.data.news);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function openForm() {
    setShowForm(true);
    setCreateError("");
    if (clubs.length === 0) {
      const [clubsRes, playersRes] = await Promise.all([
        fetch("/api/admin/clubs"),
        fetch("/api/admin/players"),
      ]);
      const clubsJson = (await clubsRes.json()) as { data?: { clubs: ClubOption[] } };
      const playersJson = (await playersRes.json()) as { data?: { players: PlayerOption[] } };
      if (clubsJson.data?.clubs) setClubs(clubsJson.data.clubs);
      if (playersJson.data?.players) setPlayers(playersJson.data.players);
    }
  }

  async function handleCreate() {
    if (!form.title.trim()) {
      setCreateError(t("news.titleRequired"));
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/admin/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: form.category,
          title: form.title.trim(),
          excerpt: form.excerpt.trim(),
          content: form.content.trim(),
          imageUrl: form.imageUrl.trim(),
          sourceUrl: form.sourceUrl.trim(),
          clubId: form.clubId,
          playerId: form.playerId,
        }),
      });
      const json = (await res.json()) as { data?: NewsRow; error?: { message?: string; code?: string } };
      if (res.ok && json.data) {
        setNews((prev) => [json.data as NewsRow, ...prev]);
        setForm(EMPTY_FORM);
        setShowForm(false);
      } else {
        setCreateError(resolveApiError(tRoot, "admin", json.error?.code));
      }
    } catch {
      setCreateError(t("common.networkError"));
    } finally {
      setCreating(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncError("");
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/news/sync", { method: "POST" });
      const json = (await res.json()) as { data?: { sources: Record<string, SourceSummary> }; error?: { message?: string; code?: string } };
      if (res.ok && json.data) {
        setSyncResult(json.data.sources);
        await load();
      } else {
        setSyncError(resolveApiError(tRoot, "admin", json.error?.code));
      }
    } catch {
      setSyncError(t("common.networkError"));
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("news.confirmDelete"))) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/news/${id}`, { method: "DELETE" });
      if (res.ok) {
        setNews((prev) => prev.filter((n) => n.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-wide text-text">{t("news.title")}</h1>
          <p className="mt-1 text-sm text-text-muted">
            {t("news.subtitle", { count: news.length })}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={showForm ? () => setShowForm(false) : openForm}
            className="rounded border border-border px-4 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface"
          >
            {showForm ? t("common.cancel") : t("news.addButton")}
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-bg transition-opacity disabled:opacity-40"
          >
            {syncing ? t("news.syncing") : t("news.syncButton")}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-medium text-text">{t("news.formTitle")}</p>

          {createError && <p className="rounded bg-points-neg/10 px-3 py-2 text-xs text-points-neg">{createError}</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs text-text-muted">{t("news.titleLabel")}</span>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="rounded border border-border bg-bg px-3 py-2 text-sm text-text"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("news.categoryLabel")}</span>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as (typeof CREATABLE_CATEGORIES)[number] }))}
                className="rounded border border-border bg-bg px-3 py-2 text-sm text-text"
              >
                {CREATABLE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {tLabels(`newsCategory.${c}`)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("news.imageUrlLabel")}</span>
              <input
                type="text"
                value={form.imageUrl}
                onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                className="rounded border border-border bg-bg px-3 py-2 text-sm text-text"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("news.clubLabel")}</span>
              <select
                value={form.clubId}
                onChange={(e) => setForm((f) => ({ ...f, clubId: e.target.value }))}
                className="rounded border border-border bg-bg px-3 py-2 text-sm text-text"
              >
                <option value="">{t("news.noneOption")}</option>
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.shortName}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("news.playerLabel")}</span>
              <select
                value={form.playerId}
                onChange={(e) => setForm((f) => ({ ...f, playerId: e.target.value }))}
                className="rounded border border-border bg-bg px-3 py-2 text-sm text-text"
              >
                <option value="">{t("news.noneOption")}</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName} ({p.club.shortName})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs text-text-muted">{t("news.excerptLabel")}</span>
              <input
                type="text"
                value={form.excerpt}
                onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
                className="rounded border border-border bg-bg px-3 py-2 text-sm text-text"
              />
            </label>

            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs text-text-muted">{t("news.contentLabel")}</span>
              <textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                rows={4}
                className="rounded border border-border bg-bg px-3 py-2 text-sm text-text"
              />
            </label>

            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs text-text-muted">{t("news.sourceUrlLabel")}</span>
              <input
                type="text"
                value={form.sourceUrl}
                onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))}
                className="rounded border border-border bg-bg px-3 py-2 text-sm text-text"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="rounded px-4 py-2 text-sm text-text-muted hover:text-text"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="rounded bg-accent px-4 py-2 text-sm font-semibold text-bg transition-opacity disabled:opacity-40"
            >
              {creating ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>
      )}

      {syncError && <p className="rounded bg-points-neg/10 px-3 py-2 text-xs text-points-neg">{syncError}</p>}

      {syncResult && (
        <div className="rounded-lg border border-border bg-surface p-4 text-xs">
          <p className="mb-2 font-medium text-text">{t("news.syncResultTitle")}</p>
          <div className="flex flex-col gap-1">
            {Object.entries(syncResult).map(([source, s]) => (
              <div key={source} className="flex items-center gap-3 font-mono">
                <span className="w-32 shrink-0 text-text-muted">{source}</span>
                {s.error ? (
                  <span className="text-points-neg">{t("news.sourceError", { error: s.error })}</span>
                ) : (
                  <span className="text-text">
                    {t("news.sourceSummary", {
                      fetched: s.fetched,
                      inserted: s.inserted,
                      duplicates: s.duplicates,
                      tooOld: s.tooOld,
                    })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-sm text-text-muted">{t("common.loading")}</div>
      ) : news.length === 0 ? (
        <div className="py-20 text-center text-sm text-text-muted">{t("news.empty")}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {news.map((n) => (
            <div
              key={n.id}
              className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide text-text-muted">
                  <span className="rounded bg-accent/10 px-1.5 py-0.5 text-accent">
                    {tLabels(`newsCategory.${n.category}`)}
                  </span>
                  <span>{n.sourceKey}</span>
                  {n.club && <span>· {n.club}</span>}
                  {n.player && <span>· {n.player}</span>}
                  <span>· {format.dateTime(new Date(n.publishedAt), { dateStyle: "medium" })}</span>
                </div>
                <p className="mt-1 truncate text-sm text-text">{n.title}</p>
                {n.sourceUrl && (
                  <a
                    href={n.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-text-muted underline hover:text-text"
                  >
                    {t("news.viewSource")}
                  </a>
                )}
              </div>
              <button
                onClick={() => handleDelete(n.id)}
                disabled={deletingId === n.id}
                className="shrink-0 rounded bg-points-neg/10 px-3 py-1.5 text-xs font-medium text-points-neg transition-opacity hover:bg-points-neg/20 disabled:opacity-40"
              >
                {deletingId === n.id ? "…" : t("common.delete")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
