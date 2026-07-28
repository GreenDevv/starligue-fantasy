"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations, useFormatter } from "next-intl";
import { resolveApiError } from "@/lib/api/error-messages";

interface TransferWindow {
  id: string;
  seasonId: string;
  seasonLabel: string;
  label: string;
  opensAt: string;
  closesAt: string;
}

interface SeasonOption {
  id: string;
  label: string;
  isActive: boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Format "YYYY-MM-DDTHH:mm" en heure locale du navigateur, pour un <input type="datetime-local">.
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatRange(format: ReturnType<typeof useFormatter>, opensAt: string, closesAt: string): string {
  const fmt = (iso: string) =>
    format.dateTime(new Date(iso), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return `${fmt(opensAt)} → ${fmt(closesAt)}`;
}

function WindowPanel({
  window: w,
  seasons,
  onClose,
  onSaved,
  onDeleted,
}: {
  window: TransferWindow | { seasonId: string };
  seasons: SeasonOption[];
  onClose: () => void;
  onSaved: (updated: TransferWindow) => void;
  onDeleted: (id: string) => void;
}) {
  const t = useTranslations("admin");
  const tRoot = useTranslations();
  const isNew = !("id" in w);
  const [seasonId, setSeasonId] = useState(w.seasonId || seasons[0]?.id || "");
  const [label, setLabel] = useState("id" in w ? w.label : "");
  const [opensAt, setOpensAt] = useState("id" in w ? toDatetimeLocalValue(w.opensAt) : "");
  const [closesAt, setClosesAt] = useState("id" in w ? toDatetimeLocalValue(w.closesAt) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canSave = seasonId && label.trim().length > 0 && opensAt && closesAt;

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body = {
        seasonId,
        label: label.trim(),
        opensAt: new Date(opensAt).toISOString(),
        closesAt: new Date(closesAt).toISOString(),
      };
      const res = await fetch(isNew ? "/api/admin/transfer-windows" : `/api/admin/transfer-windows/${w.id}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { data?: TransferWindow; error?: { message?: string; code?: string } };
      if (res.ok && json.data) {
        onSaved(json.data);
        onClose();
      } else {
        setError(resolveApiError(tRoot, "admin", json.error?.code));
      }
    } catch {
      setError(t("common.networkError"));
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!("id" in w)) return;
    setSaving(true);
    try {
      await fetch(`/api/admin/transfer-windows/${w.id}`, { method: "DELETE" });
      onDeleted(w.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="font-display text-lg uppercase tracking-wide text-text">
          {isNew ? t("transferWindows.newTitle") : label}
        </h2>
        <button onClick={onClose} className="text-text-muted transition-colors hover:text-text">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-muted">
              {t("transferWindows.seasonLabel")}
            </label>
            <select
              value={seasonId}
              onChange={(e) => setSeasonId(e.target.value)}
              className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} {s.isActive ? t("transferWindows.activeSeasonSuffix") : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-muted">
              {t("transferWindows.labelLabel")}
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("transferWindows.labelPlaceholder")}
              className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-muted">
              {t("transferWindows.opensAtLabel")}
            </label>
            <input
              type="datetime-local"
              value={opensAt}
              onChange={(e) => setOpensAt(e.target.value)}
              className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-muted">
              {t("transferWindows.closesAtLabel")}
            </label>
            <input
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            />
          </div>

          <p className="text-[10px] text-text-muted">
            {t("transferWindows.simulationHelp")}
          </p>
        </div>
      </div>

      <div className="border-t border-border px-5 py-4">
        {error && <p className="mb-3 rounded bg-points-neg/10 px-3 py-2 text-xs text-points-neg">{error}</p>}
        <div className="flex gap-2">
          {!isNew && (
            <button
              onClick={confirmDelete ? del : () => setConfirmDelete(true)}
              disabled={saving}
              className={`rounded px-4 py-2.5 text-sm font-semibold transition-colors ${
                confirmDelete
                  ? "bg-points-neg text-white"
                  : "border border-points-neg/40 text-points-neg hover:bg-points-neg/10"
              }`}
            >
              {confirmDelete ? t("common.confirmQuestion") : t("common.delete")}
            </button>
          )}
          <button
            onClick={save}
            disabled={!canSave || saving}
            className="flex-1 rounded bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition-opacity disabled:opacity-40"
          >
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminTransferWindowsPage() {
  const t = useTranslations("admin");
  const format = useFormatter();
  const [windows, setWindows] = useState<TransferWindow[]>([]);
  const [seasons, setSeasons] = useState<SeasonOption[]>([]);
  const [selected, setSelected] = useState<TransferWindow | { seasonId: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const overlayRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/transfer-windows");
    const json = (await res.json()) as { data?: { windows: TransferWindow[]; seasons: SeasonOption[] } };
    if (json.data) {
      setWindows(json.data.windows);
      setSeasons(json.data.seasons);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function handleSaved(updated: TransferWindow) {
    setWindows((prev) => {
      const exists = prev.some((w) => w.id === updated.id);
      return exists ? prev.map((w) => (w.id === updated.id ? updated : w)) : [...prev, updated];
    });
  }

  function handleDeleted(id: string) {
    setWindows((prev) => prev.filter((w) => w.id !== id));
  }

  const now = Date.now();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-wide text-text">{t("transferWindows.title")}</h1>
          <p className="mt-1 text-sm text-text-muted">
            {t("transferWindows.subtitle", { count: windows.length })}
          </p>
        </div>
        <button
          onClick={() => setSelected({ seasonId: seasons.find((s) => s.isActive)?.id ?? seasons[0]?.id ?? "" })}
          disabled={seasons.length === 0}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {t("transferWindows.newButton")}
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-text-muted">{t("common.loading")}</div>
      ) : windows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-text-muted">
          {t("transferWindows.empty")}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {windows.map((w) => {
            const isOpenNow = now >= new Date(w.opensAt).getTime() && now <= new Date(w.closesAt).getTime();
            return (
              <button
                key={w.id}
                onClick={() => setSelected(w)}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-accent/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-base font-bold uppercase tracking-wider text-text">
                      {w.label}
                    </span>
                    <span className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] text-accent">
                      {w.seasonLabel}
                    </span>
                    {isOpenNow && (
                      <span className="rounded-full bg-points-pos/15 px-2 py-0.5 text-[10px] font-bold uppercase text-points-pos">
                        {t("transferWindows.openBadge")}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-text-muted">{formatRange(format, w.opensAt, w.closesAt)}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              ref={overlayRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 right-0 top-0 z-50 w-full max-w-md overflow-hidden bg-surface shadow-2xl"
            >
              <WindowPanel
                window={selected}
                seasons={seasons}
                onClose={() => setSelected(null)}
                onSaved={handleSaved}
                onDeleted={handleDeleted}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
