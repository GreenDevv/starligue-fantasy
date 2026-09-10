"use client";

// Corrections LNH a posteriori (ARCHITECTURE.md §4.3). La LNH révise certaines
// notes de performance 2-3 jours après les matchs. Le cron hebdo applique les
// corrections + rejoue le scoring tout seul et crée un "lot" (LnhCorrectionBatch)
// en attente de notification ; cet écran sert à relire ces lots et déclencher (ou
// non) l'envoi des emails d'explication aux managers — et à lancer une passe
// manuelle sur une journée précise.
import { useState, useEffect, useCallback } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { resolveApiError } from "@/lib/api/error-messages";

interface FieldChange {
  field: string;
  before: number | boolean | null;
  after: number | boolean | null;
}
interface CorrectionView {
  key: string;
  matchId: string;
  playerId: string;
  playerName: string;
  club: string;
  ratingChanged: boolean;
  ratingBefore: number | null;
  ratingAfter: number | null;
  changes: FieldChange[];
}
interface MatchCorrections {
  matchId: string;
  label: string;
  corrections: CorrectionView[];
}
interface CorrectionSummary {
  playerId: string;
  playerName: string;
  club: string;
  ratingBefore: number | null;
  ratingAfter: number | null;
  ratingChanged: boolean;
  otherFieldCount: number;
}
interface ImpactRow {
  teamId: string;
  userId: string;
  email: string;
  teamName: string;
  leagueName: string;
  pointsBefore: number;
  pointsAfter: number;
  delta: number;
  globalRankBefore: number | null;
  globalRankAfter: number | null;
  leagueRankBefore: number | null;
  leagueRankAfter: number | null;
  directCorrections: CorrectionSummary[];
  indirect: boolean;
}
interface PendingBatch {
  id: string;
  gameweekNumber: number;
  appliedAt: string;
  appliedBy: string;
  correctionCount: number;
  report: { impactRows: ImpactRow[] };
}
interface AnalyzeData {
  gameweekNumber: number;
  seasonLabel: string;
  isScored: boolean;
  matchesScraped: number;
  totalCorrections: number;
  ratingCorrections: number;
  matches: MatchCorrections[];
  pendingBatches: PendingBatch[];
}
interface ApplyResult {
  isScored: boolean;
  recomputed: boolean;
  appliedCount: number;
  impactRows: ImpactRow[];
  batchId: string | null;
  note?: string;
}

function fmt(n: number | null): string {
  return n === null ? "—" : n.toFixed(1).replace(".", ",");
}
function fmtDelta(n: number): string {
  if (Math.abs(n) < 0.05) return "±0";
  return `${n > 0 ? "+" : "−"}${Math.abs(n).toFixed(1).replace(".", ",")}`;
}

// ---- Tableau d'impact + envoi/ignore/annulation, réutilisé par chaque lot ----

function BatchCard({ batch, onChanged }: { batch: PendingBatch; onChanged: () => void }) {
  const t = useTranslations("admin");
  const tRoot = useTranslations();
  const format = useFormatter();
  const rows = batch.report.impactRows;
  const [notify, setNotify] = useState<Set<string>>(() => new Set(rows.map((r) => r.teamId)));
  const [busy, setBusy] = useState<"" | "send" | "dismiss" | "revert">("");
  const [msg, setMsg] = useState("");

  async function call(path: string, body: unknown, kind: "send" | "dismiss" | "revert") {
    setBusy(kind);
    setMsg("");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        data?: { sent?: number; skipped?: number; failed?: number };
        error?: { code?: string; message?: string };
      };
      if (res.ok) {
        if (kind === "send" && json.data) {
          setMsg(
            t("lnhCorrections.sendResult", {
              sent: json.data.sent ?? 0,
              skipped: json.data.skipped ?? 0,
              failed: json.data.failed ?? 0,
            })
          );
        }
        onChanged();
      } else {
        setMsg(json.error?.message || resolveApiError(tRoot, "admin", json.error?.code));
        setBusy("");
      }
    } catch {
      setMsg(t("common.networkError"));
      setBusy("");
    }
  }

  const who =
    batch.appliedBy === "cron" ? t("lnhCorrections.byCron") : t("lnhCorrections.byAdmin");

  return (
    <div className="rounded-lg border border-accent/30 bg-accent/5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold text-text">
          {t("lnhCorrections.batchTitle", { gw: batch.gameweekNumber, count: batch.correctionCount })}
        </span>
        <span className="text-xs text-text-muted">
          {who} · {format.dateTime(new Date(batch.appliedAt), { dateStyle: "medium", timeStyle: "short" })}
        </span>
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={notify.size === rows.length}
                    onChange={(e) => setNotify(e.target.checked ? new Set(rows.map((r) => r.teamId)) : new Set())}
                    className="accent-accent"
                  />
                </th>
                <th className="px-3 py-2 text-left">{t("lnhCorrections.colManager")}</th>
                <th className="px-3 py-2 text-left">{t("lnhCorrections.colTeam")}</th>
                <th className="px-3 py-2 text-right">{t("lnhCorrections.colPoints")}</th>
                <th className="px-3 py-2 text-right">{t("lnhCorrections.colRank")}</th>
                <th className="px-3 py-2 text-left">{t("lnhCorrections.colWhy")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.teamId} className="bg-bg">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={notify.has(r.teamId)}
                      onChange={() =>
                        setNotify((prev) => {
                          const next = new Set(prev);
                          if (next.has(r.teamId)) next.delete(r.teamId);
                          else next.add(r.teamId);
                          return next;
                        })
                      }
                      className="accent-accent"
                    />
                  </td>
                  <td className="px-3 py-2 text-text-muted">{r.email}</td>
                  <td className="px-3 py-2 text-text">
                    {r.teamName}
                    <span className="block text-xs text-text-muted">{r.leagueName}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-text">
                    {fmt(r.pointsBefore)} → {fmt(r.pointsAfter)}
                    <span className={`ml-1 font-semibold ${r.delta >= 0 ? "text-points-pos" : "text-points-neg"}`}>
                      {fmtDelta(r.delta)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-text-muted">
                    {r.globalRankBefore !== null && r.globalRankAfter !== null && r.globalRankBefore !== r.globalRankAfter
                      ? `${r.globalRankBefore}ᵉ → ${r.globalRankAfter}ᵉ`
                      : "="}
                  </td>
                  <td className="px-3 py-2 text-xs text-text-muted">
                    {r.indirect
                      ? t("lnhCorrections.indirectReason")
                      : r.directCorrections
                          .map((d) =>
                            d.ratingChanged
                              ? `${d.playerName} ${fmt(d.ratingBefore)}→${fmt(d.ratingAfter)}`
                              : `${d.playerName} (stats)`
                          )
                          .join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 px-3 py-3">
        <button
          onClick={() => call("/api/admin/lnh-corrections/send-emails", { batchId: batch.id, teamIds: [...notify] }, "send")}
          disabled={notify.size === 0 || busy !== ""}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-bg transition-opacity disabled:opacity-40"
        >
          {busy === "send" ? t("lnhCorrections.sending") : t("lnhCorrections.sendButton", { count: notify.size })}
        </button>
        <button
          onClick={() => {
            if (confirm(t("lnhCorrections.confirmDismiss"))) call("/api/admin/lnh-corrections/dismiss", { batchId: batch.id }, "dismiss");
          }}
          disabled={busy !== ""}
          className="rounded border border-border px-3 py-2 text-sm text-text-muted transition-colors hover:text-text disabled:opacity-40"
        >
          {busy === "dismiss" ? "…" : t("lnhCorrections.dismissButton")}
        </button>
        <button
          onClick={() => {
            if (confirm(t("lnhCorrections.confirmRevert"))) call("/api/admin/lnh-corrections/revert", { batchId: batch.id }, "revert");
          }}
          disabled={busy !== ""}
          className="rounded border border-points-neg/40 px-3 py-2 text-sm text-points-neg transition-colors hover:bg-points-neg/10 disabled:opacity-40"
        >
          {busy === "revert" ? t("lnhCorrections.reverting") : t("lnhCorrections.revertButton")}
        </button>
        {msg && <span className="text-xs text-text-muted">{msg}</span>}
      </div>
    </div>
  );
}

// ---- Page ----

export default function AdminLnhCorrectionsPage() {
  const t = useTranslations("admin");
  const tRoot = useTranslations();

  const [pending, setPending] = useState<PendingBatch[]>([]);
  const [gwInput, setGwInput] = useState("");
  const [phase, setPhase] = useState<"idle" | "analyzing" | "analyzed" | "applying">("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [analysis, setAnalysis] = useState<AnalyzeData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const loadPending = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/lnh-corrections");
      const json = (await res.json()) as { data?: { pendingBatches: PendingBatch[] } };
      if (json.data) setPending(json.data.pendingBatches);
    } catch {
      /* silencieux — section secondaire */
    }
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  async function analyze() {
    const gw = parseInt(gwInput, 10);
    if (!gw) return;
    setPhase("analyzing");
    setError("");
    setNotice("");
    setAnalysis(null);
    setSelected(new Set());
    try {
      const res = await fetch(`/api/admin/lnh-corrections?gameweek=${gw}`);
      const json = (await res.json()) as { data?: AnalyzeData; error?: { code?: string; message?: string } };
      if (res.ok && json.data) {
        setAnalysis(json.data);
        setPending(json.data.pendingBatches);
        setSelected(new Set(json.data.matches.flatMap((m) => m.corrections.map((c) => c.key))));
        setPhase("analyzed");
      } else {
        setError(json.error?.message || resolveApiError(tRoot, "admin", json.error?.code));
        setPhase("idle");
      }
    } catch {
      setError(t("common.networkError"));
      setPhase("idle");
    }
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function toggleMatch(m: MatchCorrections, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of m.corrections) {
        if (on) next.add(c.key);
        else next.delete(c.key);
      }
      return next;
    });
  }

  async function apply() {
    if (!analysis || selected.size === 0) return;
    if (
      analysis.isScored &&
      !confirm(t("lnhCorrections.confirmApply", { count: selected.size, gw: analysis.gameweekNumber }))
    )
      return;
    setPhase("applying");
    setError("");
    try {
      const res = await fetch("/api/admin/lnh-corrections/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameweek: analysis.gameweekNumber, correctionKeys: [...selected] }),
      });
      const json = (await res.json()) as { data?: ApplyResult; error?: { code?: string; message?: string } };
      if (res.ok && json.data) {
        const r = json.data;
        setAnalysis(null);
        setPhase("idle");
        setGwInput("");
        await loadPending();
        setNotice(
          r.batchId
            ? t("lnhCorrections.appliedWithBatch", { count: r.appliedCount, teams: r.impactRows.length })
            : r.note || t("lnhCorrections.appliedNoImpact", { count: r.appliedCount })
        );
      } else {
        setError(json.error?.message || resolveApiError(tRoot, "admin", json.error?.code));
        setPhase("analyzed");
      }
    } catch {
      setError(t("common.networkError"));
      setPhase("analyzed");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-wide text-text">{t("lnhCorrections.title")}</h1>
        <p className="mt-1 text-sm text-text-muted">{t("lnhCorrections.subtitle")}</p>
      </div>

      {notice && (
        <p className="rounded border border-points-pos/30 bg-points-pos/5 p-2 text-xs text-text">{notice}</p>
      )}
      {error && <p className="rounded border border-points-neg/30 bg-points-neg/5 p-2 text-xs text-points-neg">{error}</p>}

      {/* Lots en attente de notification (cron ou passes manuelles précédentes) */}
      {pending.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-text-muted">
            {t("lnhCorrections.pendingTitle", { count: pending.length })}
          </h2>
          {pending.map((b) => (
            <BatchCard key={b.id} batch={b} onChanged={loadPending} />
          ))}
        </section>
      )}

      {/* Passe manuelle sur une journée */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-text-muted">
          {t("lnhCorrections.manualTitle")}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={1}
            max={30}
            value={gwInput}
            onChange={(e) => setGwInput(e.target.value)}
            placeholder={t("lnhCorrections.gwPlaceholder")}
            className="w-28 rounded border border-border bg-bg px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
          />
          <button
            onClick={analyze}
            disabled={phase === "analyzing" || !gwInput}
            className="rounded border border-accent/40 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
          >
            {phase === "analyzing" ? t("lnhCorrections.analyzing") : t("lnhCorrections.analyzeButton")}
          </button>
        </div>

        {analysis && (phase === "analyzed" || phase === "applying") && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-border bg-surface p-3 text-sm text-text-muted">
              {t("lnhCorrections.summary", {
                gw: analysis.gameweekNumber,
                season: analysis.seasonLabel,
                scraped: analysis.matchesScraped,
                total: analysis.totalCorrections,
                ratings: analysis.ratingCorrections,
              })}
              {!analysis.isScored && (
                <span className="ml-2 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-accent">
                  {t("lnhCorrections.notScoredBadge")}
                </span>
              )}
            </div>

            {analysis.totalCorrections === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-text-muted">
                {t("lnhCorrections.noCorrections")}
              </div>
            ) : (
              analysis.matches.map((m) => {
                const allOn = m.corrections.every((c) => selected.has(c.key));
                return (
                  <div key={m.matchId} className="rounded-lg border border-border bg-surface">
                    <div className="flex items-center justify-between border-b border-border px-3 py-2">
                      <span className="text-sm font-semibold text-text">{m.label}</span>
                      <button onClick={() => toggleMatch(m, !allOn)} className="text-xs text-accent hover:opacity-80">
                        {allOn ? t("lnhCorrections.deselectMatch") : t("lnhCorrections.selectMatch")}
                      </button>
                    </div>
                    <div className="divide-y divide-border">
                      {m.corrections.map((c) => (
                        <label key={c.key} className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-bg/40">
                          <input
                            type="checkbox"
                            checked={selected.has(c.key)}
                            onChange={() => toggle(c.key)}
                            className="mt-1 accent-accent"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                              <span className="font-medium text-text">{c.playerName}</span>
                              <span className="text-xs text-text-muted">{c.club}</span>
                              {c.ratingChanged && (
                                <span
                                  className={`text-xs font-semibold ${
                                    (c.ratingAfter ?? 0) >= (c.ratingBefore ?? 0) ? "text-points-pos" : "text-points-neg"
                                  }`}
                                >
                                  {t("lnhCorrections.noteLabel")} {fmt(c.ratingBefore)} → {fmt(c.ratingAfter)}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 font-mono text-[11px] text-text-muted">
                              {c.changes
                                .map((ch) => `${ch.field}: ${JSON.stringify(ch.before)} → ${JSON.stringify(ch.after)}`)
                                .join("  ·  ")}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })
            )}

            {analysis.totalCorrections > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={apply}
                  disabled={selected.size === 0 || phase === "applying"}
                  className="rounded bg-accent px-4 py-2 text-sm font-semibold text-bg transition-opacity disabled:opacity-40"
                >
                  {phase === "applying"
                    ? t("lnhCorrections.applying")
                    : t("lnhCorrections.applyButton", { count: selected.size })}
                </button>
                <span className="text-xs text-text-muted">
                  {analysis.isScored ? t("lnhCorrections.applyHint") : t("lnhCorrections.applyHintNotScored")}
                </span>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
