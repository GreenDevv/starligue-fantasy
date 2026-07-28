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
        <button
          onClick={handleSync}
          disabled={syncing}
          className="shrink-0 rounded bg-accent px-4 py-2 text-sm font-semibold text-bg transition-opacity disabled:opacity-40"
        >
          {syncing ? t("news.syncing") : t("news.syncButton")}
        </button>
      </div>

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
