"use client";

// Corrections LNH a posteriori (ARCHITECTURE.md §4.3). La LNH révise certaines
// notes de performance 2-3 jours après les matchs — cet écran re-scrape une
// journée, montre les écarts avec ce qu'on a enregistré, laisse l'admin appliquer
// tout ou partie des corrections (recompute de la journée), puis relire le compte
// rendu par manager avant de déclencher l'envoi des emails d'explication.
import { useState } from "react";
import { useTranslations } from "next-intl";
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
interface AnalyzeResult {
  gameweekId: string;
  gameweekNumber: number;
  seasonLabel: string;
  isScored: boolean;
  matchesScraped: number;
  totalCorrections: number;
  ratingCorrections: number;
  matches: MatchCorrections[];
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
interface UndoEntry {
  matchId: string;
  playerId: string;
  before: Record<string, number | boolean | null>;
}
interface ApplyResult {
  gameweekId: string;
  gameweekNumber: number;
  isScored: boolean;
  recomputed: boolean;
  appliedCount: number;
  statsUpserted: number;
  correctionsApplied: CorrectionSummary[];
  impactRows: ImpactRow[];
  undo: UndoEntry[];
  note?: string;
}

function fmt(n: number | null): string {
  return n === null ? "—" : n.toFixed(1).replace(".", ",");
}
function fmtDelta(n: number): string {
  if (Math.abs(n) < 0.05) return "±0";
  return `${n > 0 ? "+" : "−"}${Math.abs(n).toFixed(1).replace(".", ",")}`;
}

export default function AdminLnhCorrectionsPage() {
  const t = useTranslations("admin");
  const tRoot = useTranslations();

  const [gwInput, setGwInput] = useState("1");
  const [phase, setPhase] = useState<"idle" | "analyzing" | "analyzed" | "applying" | "applied">("idle");
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [notifySelected, setNotifySelected] = useState<Set<string>>(new Set());
  const [sendState, setSendState] = useState<{ status: "idle" | "sending" | "done"; detail: string }>({ status: "idle", detail: "" });
  const [reverting, setReverting] = useState(false);

  async function analyze() {
    setPhase("analyzing");
    setError("");
    setAnalysis(null);
    setApplyResult(null);
    setSelected(new Set());
    try {
      const res = await fetch(`/api/admin/lnh-corrections?gameweek=${parseInt(gwInput, 10)}`);
      const json = (await res.json()) as { data?: AnalyzeResult; error?: { code?: string; message?: string } };
      if (res.ok && json.data) {
        setAnalysis(json.data);
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
        setApplyResult(json.data);
        setNotifySelected(new Set(json.data.impactRows.map((r) => r.teamId)));
        setSendState({ status: "idle", detail: "" });
        setPhase("applied");
      } else {
        setError(json.error?.message || resolveApiError(tRoot, "admin", json.error?.code));
        setPhase("analyzed");
      }
    } catch {
      setError(t("common.networkError"));
      setPhase("analyzed");
    }
  }

  async function sendEmails() {
    if (!applyResult) return;
    const rows = applyResult.impactRows.filter((r) => notifySelected.has(r.teamId));
    if (rows.length === 0) return;
    if (!confirm(t("lnhCorrections.confirmSend", { count: rows.length }))) return;
    setSendState({ status: "sending", detail: "" });
    try {
      const res = await fetch("/api/admin/lnh-corrections/send-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameweek: applyResult.gameweekNumber, rows }),
      });
      const json = (await res.json()) as {
        data?: { recipients: number; sent: number; skipped: number; failed: number; errors: string[] };
        error?: { code?: string; message?: string };
      };
      if (res.ok && json.data) {
        setSendState({
          status: "done",
          detail: t("lnhCorrections.sendResult", {
            sent: json.data.sent,
            skipped: json.data.skipped,
            failed: json.data.failed,
          }),
        });
      } else {
        setSendState({ status: "idle", detail: json.error?.message || resolveApiError(tRoot, "admin", json.error?.code) });
      }
    } catch {
      setSendState({ status: "idle", detail: t("common.networkError") });
    }
  }

  async function revert() {
    if (!applyResult || applyResult.undo.length === 0) return;
    if (!confirm(t("lnhCorrections.confirmRevert"))) return;
    setReverting(true);
    try {
      const res = await fetch("/api/admin/lnh-corrections/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameweek: applyResult.gameweekNumber, undo: applyResult.undo }),
      });
      const json = (await res.json()) as { data?: { reverted: number }; error?: { code?: string; message?: string } };
      if (res.ok && json.data) {
        setApplyResult(null);
        setPhase("idle");
        setAnalysis(null);
        setError(t("lnhCorrections.revertDone", { count: json.data.reverted }));
      } else {
        setError(json.error?.message || resolveApiError(tRoot, "admin", json.error?.code));
      }
    } catch {
      setError(t("common.networkError"));
    } finally {
      setReverting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-wide text-text">{t("lnhCorrections.title")}</h1>
        <p className="mt-1 text-sm text-text-muted">{t("lnhCorrections.subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={1}
          max={30}
          value={gwInput}
          onChange={(e) => setGwInput(e.target.value)}
          className="w-24 rounded border border-border bg-bg px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
        />
        <button
          onClick={analyze}
          disabled={phase === "analyzing" || !gwInput}
          className="rounded border border-accent/40 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
        >
          {phase === "analyzing" ? t("lnhCorrections.analyzing") : t("lnhCorrections.analyzeButton")}
        </button>
      </div>

      {error && <p className="rounded border border-points-neg/30 bg-points-neg/5 p-2 text-xs text-points-neg">{error}</p>}

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
                    <button
                      onClick={() => toggleMatch(m, !allOn)}
                      className="text-xs text-accent hover:opacity-80"
                    >
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
            <div className="sticky bottom-0 flex items-center gap-3 border-t border-border bg-bg/95 py-3">
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

      {applyResult && phase === "applied" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-points-pos/30 bg-points-pos/5 p-3 text-sm text-text">
            {t("lnhCorrections.appliedSummary", {
              count: applyResult.appliedCount,
              teams: applyResult.impactRows.length,
            })}
            {applyResult.note && <p className="mt-1 text-xs text-text-muted">{applyResult.note}</p>}
          </div>

          {applyResult.recomputed && applyResult.impactRows.length > 0 && (
            <>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-surface text-xs uppercase tracking-wide text-text-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">
                        <input
                          type="checkbox"
                          checked={notifySelected.size === applyResult.impactRows.length}
                          onChange={(e) =>
                            setNotifySelected(
                              e.target.checked ? new Set(applyResult.impactRows.map((r) => r.teamId)) : new Set()
                            )
                          }
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
                    {applyResult.impactRows.map((r) => (
                      <tr key={r.teamId} className="bg-bg">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={notifySelected.has(r.teamId)}
                            onChange={() =>
                              setNotifySelected((prev) => {
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
                          <span
                            className={`ml-1 font-semibold ${r.delta >= 0 ? "text-points-pos" : "text-points-neg"}`}
                          >
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

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={sendEmails}
                  disabled={notifySelected.size === 0 || sendState.status === "sending" || sendState.status === "done"}
                  className="rounded bg-accent px-4 py-2 text-sm font-semibold text-bg transition-opacity disabled:opacity-40"
                >
                  {sendState.status === "sending"
                    ? t("lnhCorrections.sending")
                    : t("lnhCorrections.sendButton", { count: notifySelected.size })}
                </button>
                <button
                  onClick={revert}
                  disabled={reverting || applyResult.undo.length === 0}
                  className="rounded border border-points-neg/40 px-3 py-2 text-sm text-points-neg transition-colors hover:bg-points-neg/10 disabled:opacity-40"
                >
                  {reverting ? t("lnhCorrections.reverting") : t("lnhCorrections.revertButton")}
                </button>
                {sendState.detail && (
                  <span className={`text-xs ${sendState.status === "done" ? "text-points-pos" : "text-points-neg"}`}>
                    {sendState.detail}
                  </span>
                )}
              </div>
            </>
          )}

          {applyResult.recomputed && applyResult.impactRows.length === 0 && (
            <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-text-muted">
              {t("lnhCorrections.noImpact")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
