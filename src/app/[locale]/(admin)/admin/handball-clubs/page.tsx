"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { countryFlag } from "@/lib/geo/countries";

interface AdminClub {
  id: string;
  name: string;
  city: string | null;
  zipcode: string | null;
  country: string;
  source: "FFHANDBALL" | "MANUAL" | "OSM";
  verified: boolean;
  createdAt: string;
  memberCount: number;
}

export default function AdminHandballClubsPage() {
  const t = useTranslations("admin.homeClubs");
  const tc = useTranslations("admin.common");
  const format = useFormatter();
  const [filter, setFilter] = useState<"unverified" | "all">("unverified");
  const [clubs, setClubs] = useState<AdminClub[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mergeInto, setMergeInto] = useState<Record<string, string>>({});
  const [confirmRejectId, setConfirmRejectId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/handball-clubs?filter=${filter}`);
    const json = (await res.json()) as { data?: { clubs: AdminClub[] } };
    setClubs(json.data?.clubs ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/handball-clubs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/handball-clubs/${id}`, { method: "DELETE" });
      if (res.ok) {
        setConfirmRejectId(null);
        await load();
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-wide text-text">{t("title")}</h1>
        <p className="mt-1 text-sm text-text-muted">{t("desc")}</p>
      </div>

      <div className="flex gap-2">
        {(["unverified", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded border px-3 py-1 text-xs ${
              filter === f ? "border-accent text-accent" : "border-border text-text-muted"
            }`}
          >
            {f === "unverified" ? t("filterUnverified") : t("filterAll")}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-text-muted">…</p>
      ) : clubs.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-text-muted">
          {t("empty")}
        </p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border bg-surface">
          {clubs.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text">
                  {countryFlag(c.country)} {c.name}
                  {c.city && <span className="text-text-muted"> · {c.city}</span>}
                  {!c.verified && (
                    <span className="ml-2 rounded bg-points-neg/15 px-1.5 py-0.5 text-[10px] uppercase text-points-neg">
                      {c.source}
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-text-muted">
                  {c.memberCount} {t("members")} ·{" "}
                  {format.dateTime(new Date(c.createdAt), { dateStyle: "medium" })} ·{" "}
                  <span className="font-mono">{c.id}</span>
                </p>
              </div>

              {!c.verified && (
                <button
                  onClick={() => act(c.id, { action: "verify" })}
                  disabled={busyId === c.id}
                  className="shrink-0 rounded bg-accent px-3 py-1 text-xs font-semibold text-bg disabled:opacity-50"
                >
                  {t("verify")}
                </button>
              )}

              {!c.verified &&
                c.source === "MANUAL" &&
                (confirmRejectId === c.id ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => reject(c.id)}
                      disabled={busyId === c.id}
                      className="rounded bg-points-neg px-3 py-1 text-xs font-semibold text-bg disabled:opacity-50"
                    >
                      {tc("confirmQuestion")}
                    </button>
                    <button
                      onClick={() => setConfirmRejectId(null)}
                      className="rounded border border-border px-2 py-1 text-xs text-text-muted hover:text-text"
                    >
                      {tc("cancel")}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmRejectId(c.id)}
                    disabled={busyId === c.id}
                    className="shrink-0 rounded border border-points-neg/40 px-3 py-1 text-xs font-semibold text-points-neg hover:bg-points-neg/10 disabled:opacity-50"
                    title={t("rejectHint")}
                  >
                    {t("reject")}
                  </button>
                ))}

              <div className="flex shrink-0 items-center gap-1">
                <input
                  value={mergeInto[c.id] ?? ""}
                  onChange={(e) => setMergeInto((m) => ({ ...m, [c.id]: e.target.value }))}
                  placeholder={t("mergeInto")}
                  className="w-44 rounded border border-border bg-bg px-2 py-1 font-mono text-[11px] text-text outline-none focus:border-accent"
                />
                <button
                  onClick={() => act(c.id, { action: "merge", intoId: (mergeInto[c.id] ?? "").trim() })}
                  disabled={busyId === c.id || !(mergeInto[c.id] ?? "").trim()}
                  className="rounded border border-border px-2 py-1 text-xs text-text-muted hover:border-accent hover:text-accent disabled:opacity-40"
                >
                  {t("merge")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
