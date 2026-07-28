"use client";

import { useState, useEffect } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { resolveApiError } from "@/lib/api/error-messages";

// ---- Types ----

interface GameConfig {
  key: string;
  value: string;
}

interface RecentMatch {
  id: string;
  gameweek: number;
  match: string;
  kickoffAt: string;
  statsCount: number;
}

interface NewsSourceStatus {
  lastRunAt: string | null;
  ok: boolean;
}

interface IngestionStatus {
  providers: {
    apiSports: { configured: boolean; leagueId: string };
    lnhScraper: { apiUrl: string | null; probeResult: null };
    news: Record<string, NewsSourceStatus>;
  };
  activeSeason: { id: string; label: string } | null;
  recentMatches: RecentMatch[];
}

// ---- Sub-components ----

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-points-pos" : "bg-points-neg"}`}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-text-muted">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ---- CSV Import ----

type ImportType = "clubs" | "players" | "fixtures" | "results" | "ratings";

function CsvImportForm({ type, label }: { type: ImportType; label: string }) {
  const t = useTranslations("admin");
  const tRoot = useTranslations();
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const file = (form.elements.namedItem("file") as HTMLInputElement).files?.[0];
    if (!file) return;

    setStatus("loading");
    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch(`/api/admin/import/${type}`, { method: "POST", body: fd });
      const json = await res.json() as { data?: { upserted?: number; errors?: string[] }; error?: { message?: string; code?: string } };
      if (res.ok && json.data) {
        const errCount = json.data.errors?.length ?? 0;
        setStatus(errCount > 0 ? "error" : "ok");
        setMessage(
          `${t("dashboard.csvImport.resultImported", { count: json.data.upserted ?? 0 })}${
            errCount > 0 ? t("dashboard.csvImport.resultErrors", { count: errCount }) : ""
          }`
        );
      } else {
        setStatus("error");
        setMessage(resolveApiError(tRoot, "admin", json.error?.code));
      }
    } catch {
      setStatus("error");
      setMessage(t("common.networkError"));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-sm text-text">{label}</span>
      <input
        name="file"
        type="file"
        accept=".csv"
        className="flex-1 text-xs text-text-muted file:mr-2 file:rounded file:border-0 file:bg-accent/10 file:px-2 file:py-1 file:text-xs file:text-accent"
        required
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="shrink-0 rounded border border-accent/40 px-3 py-1 text-xs text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
      >
        {status === "loading" ? "…" : t("dashboard.csvImport.importButton")}
      </button>
      {status !== "idle" && (
        <span
          className={`shrink-0 text-xs ${status === "ok" ? "text-points-pos" : "text-points-neg"}`}
        >
          {message}
        </span>
      )}
    </form>
  );
}

// ---- Config editor ----

function ConfigRow({ config, onSaved }: { config: GameConfig; onSaved: () => void }) {
  const t = useTranslations("admin");
  const [value, setValue] = useState(config.value);
  const [saving, setSaving] = useState(false);

  const dirty = value !== config.value;

  async function save() {
    setSaving(true);
    try {
      await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: config.key, value }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-48 shrink-0 font-mono text-xs text-text-muted">{config.key}</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="flex-1 rounded border border-border bg-bg px-2 py-1 font-mono text-xs text-text focus:border-accent focus:outline-none"
      />
      {dirty && (
        <button
          onClick={save}
          disabled={saving}
          className="shrink-0 rounded bg-accent px-2 py-1 text-xs font-semibold text-bg disabled:opacity-50"
        >
          {saving ? "…" : t("dashboard.gameConfig.save")}
        </button>
      )}
    </div>
  );
}

// ---- Cron triggers ----

function CronButton({
  label,
  path,
  description,
}: {
  label: string;
  path: string;
  description: string;
}) {
  const t = useTranslations("admin");
  const tRoot = useTranslations();
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [detail, setDetail] = useState("");

  async function trigger() {
    setStatus("loading");
    setDetail("");
    try {
      const res = await fetch(path, { method: "POST" });
      const json = await res.json() as { data?: Record<string, unknown>; error?: { message?: string; code?: string } };
      if (res.ok) {
        setStatus("ok");
        setDetail(JSON.stringify(json.data, null, 0).slice(0, 120));
      } else {
        setStatus("error");
        setDetail(resolveApiError(tRoot, "admin", json.error?.code));
      }
    } catch (e) {
      setStatus("error");
      setDetail(String(e));
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <button
          onClick={trigger}
          disabled={status === "loading"}
          className="rounded border border-border px-3 py-1.5 text-xs font-medium text-text transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {status === "loading" ? "…" : label}
        </button>
        <span className="text-xs text-text-muted">{description}</span>
        {status === "ok" && <span className="text-xs text-points-pos">✓</span>}
        {status === "error" && <span className="text-xs text-points-neg">✗</span>}
      </div>
      {detail && (
        <pre className="ml-0 rounded bg-bg p-2 font-mono text-[10px] text-text-muted">{detail}</pre>
      )}
    </div>
  );
}

// ---- LNH Roster Import ----

interface LnhImportResult {
  scraped?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  clubsMissing?: string[];
  errors?: string[];
  note?: string;
  dryRun?: boolean;
  totalScraped?: number;
  byClub?: Record<string, number>;
  byPosition?: Record<string, number>;
  sample?: Array<{ name: string; position: string; club: string; mv: number }>;
}

function LnhRosterImport() {
  const t = useTranslations("admin");
  const tRoot = useTranslations();
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [result, setResult] = useState<LnhImportResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  async function dryRun() {
    setStatus("loading");
    setResult(null);
    try {
      const res = await fetch("/api/admin/import/lnh-roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      const json = await res.json() as { data?: LnhImportResult; error?: { message?: string; code?: string } };
      if (res.ok && json.data) {
        setStatus("ok");
        setResult(json.data);
      } else {
        setStatus("error");
        setResult({ errors: [resolveApiError(tRoot, "admin", json.error?.code)] });
      }
    } catch {
      setStatus("error");
      setResult({ errors: [t("common.networkError")] });
    }
  }

  async function importRoster() {
    setStatus("loading");
    setResult(null);
    setConfirmed(false);
    try {
      const res = await fetch("/api/admin/import/lnh-roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonsId: "39" }),
      });
      const json = await res.json() as { data?: LnhImportResult; error?: { message?: string; code?: string } };
      if (res.ok && json.data) {
        setStatus("ok");
        setResult(json.data);
      } else {
        setStatus("error");
        setResult({ errors: [resolveApiError(tRoot, "admin", json.error?.code)] });
      }
    } catch {
      setStatus("error");
      setResult({ errors: [t("common.networkError")] });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-muted">
        {t.rich("dashboard.lnhRosterImport.description", {
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={dryRun}
          disabled={status === "loading"}
          className="rounded border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {status === "loading" ? "…" : t("dashboard.lnhRosterImport.dryRunButton")}
        </button>
        {!confirmed ? (
          <button
            onClick={() => setConfirmed(true)}
            disabled={status === "loading"}
            className="rounded border border-points-neg/40 px-3 py-1.5 text-xs font-medium text-points-neg transition-colors hover:bg-points-neg/10 disabled:opacity-50"
          >
            {t("dashboard.lnhRosterImport.importButton")}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-points-neg">{t("dashboard.lnhRosterImport.confirmWarning")}</span>
            <button
              onClick={importRoster}
              disabled={status === "loading"}
              className="rounded bg-points-neg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {t("common.confirm")}
            </button>
            <button
              onClick={() => setConfirmed(false)}
              className="text-xs text-text-muted underline"
            >
              {t("common.cancel")}
            </button>
          </div>
        )}
      </div>

      {result && (
        <div className={`rounded border p-3 text-xs ${status === "ok" ? "border-points-pos/30 bg-points-pos/5" : "border-points-neg/30 bg-points-neg/5"}`}>
          {result.dryRun ? (
            <div className="flex flex-col gap-1">
              <p className="font-semibold text-text">
                {t("dashboard.lnhRosterImport.dryRunResult", { count: result.totalScraped ?? 0 })}
              </p>
              <p className="text-text-muted">
                {t("dashboard.lnhRosterImport.positionsLabel")}{" "}
                {Object.entries(result.byPosition ?? {}).map(([k, v]) => `${k}:${v}`).join(" · ")}
              </p>
              <p className="text-text-muted">
                {t("dashboard.lnhRosterImport.clubsLabel")}{" "}
                {Object.keys(result.byClub ?? {}).sort().join(", ")}
              </p>
              {result.sample?.map((s) => (
                <p key={s.name} className="font-mono text-[10px] text-text-muted">
                  {s.name} · {s.position} · {s.club} · {s.mv}M
                </p>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="font-semibold text-text">
                {t("dashboard.lnhRosterImport.importResult", {
                  created: result.created ?? 0,
                  updated: result.updated ?? 0,
                  skipped: result.skipped ?? 0,
                })}
              </p>
              {result.note && <p className="text-text-muted">{result.note}</p>}
              {(result.clubsMissing?.length ?? 0) > 0 && (
                <p className="text-points-neg">
                  {t("dashboard.lnhRosterImport.clubsMissing", { clubs: result.clubsMissing?.join(", ") ?? "" })}
                </p>
              )}
              {(result.errors?.length ?? 0) > 0 && (
                <details>
                  <summary className="cursor-pointer text-points-neg">
                    {t("dashboard.lnhRosterImport.errorsCount", { count: result.errors?.length ?? 0 })}
                  </summary>
                  {result.errors?.map((e, i) => <p key={i} className="font-mono text-[10px] text-points-neg">{e}</p>)}
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Recompute ----

function RecomputeSection() {
  const t = useTranslations("admin");
  const tRoot = useTranslations();
  const [gwInput, setGwInput] = useState("");
  const [gameweekId, setGameweekId] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [detail, setDetail] = useState("");

  async function lookupGameweek() {
    const num = parseInt(gwInput, 10);
    if (!num) return;
    const res = await fetch(`/api/matches?gameweek=${num}`);
    const json = await res.json() as { data?: { gameweekId?: string } };
    if (json.data?.gameweekId) setGameweekId(json.data.gameweekId);
  }

  async function recompute() {
    if (!gameweekId) return;
    setStatus("loading");
    const res = await fetch(`/api/admin/recompute/${gameweekId}`, { method: "POST" });
    const json = await res.json() as { data?: Record<string, unknown>; error?: { message?: string; code?: string } };
    if (res.ok) {
      setStatus("ok");
      setDetail(JSON.stringify(json.data).slice(0, 200));
    } else {
      setStatus("error");
      setDetail(resolveApiError(tRoot, "admin", json.error?.code));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          type="number"
          placeholder={t("dashboard.recompute.placeholder")}
          value={gwInput}
          onChange={(e) => { setGwInput(e.target.value); setGameweekId(""); }}
          onBlur={lookupGameweek}
          className="w-28 rounded border border-border bg-bg px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
          min="1"
          max="30"
        />
        <button
          onClick={recompute}
          disabled={!gameweekId || status === "loading"}
          className="rounded border border-accent/40 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
        >
          {status === "loading" ? t("dashboard.recompute.computing") : t("dashboard.recompute.button")}
        </button>
        {status === "ok" && <span className="text-xs text-points-pos">✓</span>}
        {status === "error" && <span className="text-xs text-points-neg">✗</span>}
      </div>
      {detail && (
        <pre className="rounded bg-bg p-2 font-mono text-[10px] text-text-muted">{detail}</pre>
      )}
    </div>
  );
}

// ---- Page ----

export default function AdminPage() {
  const t = useTranslations("admin");
  const format = useFormatter();
  const [status, setStatus] = useState<IngestionStatus | null>(null);
  const [configs, setConfigs] = useState<GameConfig[]>([]);

  async function loadStatus() {
    const res = await fetch("/api/admin/ingestion-log");
    const json = await res.json() as { data?: IngestionStatus };
    if (json.data) setStatus(json.data);
  }

  async function loadConfigs() {
    const res = await fetch("/api/admin/config");
    const json = await res.json() as { data?: { configs: GameConfig[] } };
    if (json.data?.configs) setConfigs(json.data.configs);
  }

  useEffect(() => {
    loadStatus();
    loadConfigs();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-wide text-text">
          {t("dashboard.title")}
        </h1>
        {status?.activeSeason && (
          <p className="mt-1 text-sm text-text-muted">
            {t("dashboard.activeSeason", { label: status.activeSeason.label })}
          </p>
        )}
      </div>

      {/* Providers status */}
      <Section title={t("dashboard.sections.providers")}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm">
            <StatusDot ok={status?.providers.apiSports.configured ?? false} />
            <span className="text-text">API-Sports</span>
            {status?.providers.apiSports.configured ? (
              <span className="text-xs text-text-muted">
                {t("dashboard.apiSportsConfigured", { leagueId: status.providers.apiSports.leagueId })}
              </span>
            ) : (
              <span className="text-xs text-points-neg">
                {t("dashboard.apiSportsMissing")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <StatusDot ok={true} />
            <span className="text-text">LNH Scraper</span>
            <span className="text-xs text-text-muted">
              {t("dashboard.lnhScraperStatus")}
            </span>
          </div>
        </div>
      </Section>

      {/* News sources status — cron sync-news, une ligne par source (lnh + clubs) */}
      {status?.providers.news && Object.keys(status.providers.news).length > 0 && (
        <Section title={t("dashboard.sections.newsSources")}>
          <div className="flex flex-col gap-2">
            {Object.entries(status.providers.news).map(([sourceKey, s]) => (
              <div key={sourceKey} className="flex items-center gap-2 text-sm">
                <StatusDot ok={s.ok} />
                <span className="text-text">{sourceKey}</span>
                <span className="text-xs text-text-muted">
                  {s.lastRunAt
                    ? t("dashboard.newsLastRun", { date: format.dateTime(new Date(s.lastRunAt), { dateStyle: "medium", timeStyle: "short" }) })
                    : t("dashboard.newsNeverRun")}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Recent matches */}
      {status?.recentMatches && status.recentMatches.length > 0 && (
        <Section title={t("dashboard.sections.recentMatches")}>
          <div className="divide-y divide-border">
            {status.recentMatches.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-text-muted">{t("dashboard.gameweekShort", { number: m.gameweek })}</span>
                <span className="text-text">{m.match}</span>
                <span
                  className={`text-xs tabular-nums ${m.statsCount > 0 ? "text-points-pos" : "text-text-muted"}`}
                >
                  {m.statsCount > 0 ? t("dashboard.statsCount", { count: m.statsCount }) : t("dashboard.noStats")}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Cron triggers */}
      <Section title={t("dashboard.sections.manualTriggers")}>
        <div className="flex flex-col gap-3">
          <CronButton
            label={t("dashboard.cron.syncPlayersLnh.label")}
            path="/api/cron/sync-players-lnh"
            description={t("dashboard.cron.syncPlayersLnh.description")}
          />
          <CronButton
            label={t("dashboard.cron.syncPlayersApiSports.label")}
            path="/api/cron/sync-players"
            description={t("dashboard.cron.syncPlayersApiSports.description")}
          />
          <CronButton
            label={t("dashboard.cron.syncFixtures.label")}
            path="/api/cron/sync-fixtures"
            description={t("dashboard.cron.syncFixtures.description")}
          />
          <CronButton
            label={t("dashboard.cron.syncResults.label")}
            path="/api/cron/sync-results"
            description={t("dashboard.cron.syncResults.description")}
          />
          <CronButton
            label={t("dashboard.cron.syncRatings.label")}
            path="/api/cron/sync-ratings"
            description={t("dashboard.cron.syncRatings.description")}
          />
          <CronButton
            label={t("dashboard.cron.snapshotLineups.label")}
            path="/api/cron/snapshot-lineups"
            description={t("dashboard.cron.snapshotLineups.description")}
          />
          <CronButton
            label={t("dashboard.cron.computeScores.label")}
            path="/api/cron/compute-scores"
            description={t("dashboard.cron.computeScores.description")}
          />
          <CronButton
            label={t("dashboard.cron.syncStandings.label")}
            path="/api/cron/sync-standings"
            description={t("dashboard.cron.syncStandings.description")}
          />
        </div>
      </Section>

      {/* Simulation 2025/26 : avancée/retour en arrière déplacés dans le widget
          "Classement général" du dashboard (mode simulation, admin uniquement) */}

      {/* Test avec saison 2024 */}
      <Section title={t("dashboard.sections.testSeason2024")}>
        <div className="flex flex-col gap-3">
          <p className="text-xs text-text-muted">
            {t.rich("dashboard.testSeasonDescription", {
              code: (chunks) => <code className="rounded bg-bg px-1 font-mono text-accent">{chunks}</code>,
            })}
          </p>
          <CronButton
            label={t("dashboard.cron2024.syncPlayers.label")}
            path="/api/cron/sync-players?season=2024"
            description={t("dashboard.cron2024.syncPlayers.description")}
          />
          <CronButton
            label={t("dashboard.cron2024.syncFixtures.label")}
            path="/api/cron/sync-fixtures?season=2024"
            description={t("dashboard.cron2024.syncFixtures.description")}
          />
          <CronButton
            label={t("dashboard.cron2024.syncResults.label")}
            path="/api/cron/sync-results?season=2024"
            description={t("dashboard.cron2024.syncResults.description")}
          />
        </div>
        <p className="mt-3 text-[10px] text-text-muted">
          {t("dashboard.testSeasonNote")}
        </p>
      </Section>

      {/* LNH roster import */}
      <Section title={t("dashboard.sections.lnhRosterImport")}>
        <LnhRosterImport />
      </Section>

      {/* CSV imports */}
      <Section title={t("dashboard.sections.csvImport")}>
        <div className="flex flex-col gap-3">
          <CsvImportForm type="clubs" label={t("dashboard.csvImport.labels.clubs")} />
          <CsvImportForm type="players" label={t("dashboard.csvImport.labels.players")} />
          <CsvImportForm type="fixtures" label={t("dashboard.csvImport.labels.fixtures")} />
          <CsvImportForm type="results" label={t("dashboard.csvImport.labels.results")} />
          <CsvImportForm type="ratings" label={t("dashboard.csvImport.labels.ratings")} />
        </div>
        <p className="mt-3 text-[10px] text-text-muted">
          {t("dashboard.csvFormatsNote")}
        </p>
      </Section>

      {/* Config */}
      <Section title={t("dashboard.sections.gameConfig")}>
        <div className="flex flex-col">
          {configs.map((c) => (
            <ConfigRow key={c.key} config={c} onSaved={loadConfigs} />
          ))}
        </div>
      </Section>

      {/* Recompute */}
      <Section title={t("dashboard.sections.recompute")}>
        <RecomputeSection />
      </Section>
    </div>
  );
}
