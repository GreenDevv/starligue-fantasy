"use client";

import { useState, useEffect } from "react";

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
      const json = await res.json() as { data?: { upserted?: number; errors?: string[] }; error?: { message: string } };
      if (res.ok && json.data) {
        const errCount = json.data.errors?.length ?? 0;
        setStatus(errCount > 0 ? "error" : "ok");
        setMessage(`${json.data.upserted ?? 0} lignes importées${errCount > 0 ? `, ${errCount} erreurs` : ""}`);
      } else {
        setStatus("error");
        setMessage(json.error?.message ?? "Erreur inconnue");
      }
    } catch {
      setStatus("error");
      setMessage("Erreur réseau");
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
        {status === "loading" ? "…" : "Importer"}
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
          {saving ? "…" : "Sauver"}
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
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [detail, setDetail] = useState("");

  async function trigger() {
    setStatus("loading");
    setDetail("");
    try {
      const res = await fetch(path, { method: "POST" });
      const json = await res.json() as { data?: Record<string, unknown>; error?: { message: string } };
      if (res.ok) {
        setStatus("ok");
        setDetail(JSON.stringify(json.data, null, 0).slice(0, 120));
      } else {
        setStatus("error");
        setDetail(json.error?.message ?? "Erreur");
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
      const json = await res.json() as { data?: LnhImportResult; error?: { message: string } };
      if (res.ok && json.data) {
        setStatus("ok");
        setResult(json.data);
      } else {
        setStatus("error");
        setResult({ errors: [json.error?.message ?? "Erreur inconnue"] });
      }
    } catch {
      setStatus("error");
      setResult({ errors: ["Erreur réseau"] });
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
      const json = await res.json() as { data?: LnhImportResult; error?: { message: string } };
      if (res.ok && json.data) {
        setStatus("ok");
        setResult(json.data);
      } else {
        setStatus("error");
        setResult({ errors: [json.error?.message ?? "Erreur inconnue"] });
      }
    } catch {
      setStatus("error");
      setResult({ errors: ["Erreur réseau"] });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-muted">
        Scrape <strong>lnh.fr/daikin-starligue/stats/joueurs?seasons_id=39</strong> et remplace tous les joueurs de la saison active.
        Les market values sont calculées par poste (Score LNH non exposé par l&apos;API du site).
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={dryRun}
          disabled={status === "loading"}
          className="rounded border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {status === "loading" ? "…" : "Tester (dry run)"}
        </button>
        {!confirmed ? (
          <button
            onClick={() => setConfirmed(true)}
            disabled={status === "loading"}
            className="rounded border border-points-neg/40 px-3 py-1.5 text-xs font-medium text-points-neg transition-colors hover:bg-points-neg/10 disabled:opacity-50"
          >
            Importer et remplacer les joueurs ▸
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-points-neg">Remplace TOUS les joueurs actuels. Confirmer ?</span>
            <button
              onClick={importRoster}
              disabled={status === "loading"}
              className="rounded bg-points-neg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Confirmer
            </button>
            <button
              onClick={() => setConfirmed(false)}
              className="text-xs text-text-muted underline"
            >
              Annuler
            </button>
          </div>
        )}
      </div>

      {result && (
        <div className={`rounded border p-3 text-xs ${status === "ok" ? "border-points-pos/30 bg-points-pos/5" : "border-points-neg/30 bg-points-neg/5"}`}>
          {result.dryRun ? (
            <div className="flex flex-col gap-1">
              <p className="font-semibold text-text">Dry run — {result.totalScraped} joueurs trouvés</p>
              <p className="text-text-muted">
                Postes : {Object.entries(result.byPosition ?? {}).map(([k, v]) => `${k}:${v}`).join(" · ")}
              </p>
              <p className="text-text-muted">
                Clubs : {Object.keys(result.byClub ?? {}).sort().join(", ")}
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
                ✓ {result.created} créés · {result.updated} mis à jour · {result.skipped} ignorés
              </p>
              {result.note && <p className="text-text-muted">{result.note}</p>}
              {(result.clubsMissing?.length ?? 0) > 0 && (
                <p className="text-points-neg">Clubs non trouvés : {result.clubsMissing?.join(", ")}</p>
              )}
              {(result.errors?.length ?? 0) > 0 && (
                <details>
                  <summary className="cursor-pointer text-points-neg">{result.errors?.length} erreurs</summary>
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
    const json = await res.json() as { data?: Record<string, unknown>; error?: { message: string } };
    if (res.ok) {
      setStatus("ok");
      setDetail(JSON.stringify(json.data).slice(0, 200));
    } else {
      setStatus("error");
      setDetail(json.error?.message ?? "Erreur");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          type="number"
          placeholder="Journée N"
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
          {status === "loading" ? "Calcul…" : "Recalculer les points"}
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
          Dashboard Admin
        </h1>
        {status?.activeSeason && (
          <p className="mt-1 text-sm text-text-muted">
            Saison active : <span className="text-text">{status.activeSeason.label}</span>
          </p>
        )}
      </div>

      {/* Providers status */}
      <Section title="Providers">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm">
            <StatusDot ok={status?.providers.apiSports.configured ?? false} />
            <span className="text-text">API-Sports</span>
            {status?.providers.apiSports.configured ? (
              <span className="text-xs text-text-muted">
                Clé configurée — League ID : {status.providers.apiSports.leagueId}
              </span>
            ) : (
              <span className="text-xs text-points-neg">
                API_SPORTS_KEY manquant dans .env
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <StatusDot ok={true} />
            <span className="text-text">LNH Scraper</span>
            <span className="text-xs text-text-muted">
              lnh.fr scraping disponible — photos non disponibles (silhouettes seulement)
            </span>
          </div>
        </div>
      </Section>

      {/* News sources status — cron sync-news, une ligne par source (lnh + clubs) */}
      {status?.providers.news && Object.keys(status.providers.news).length > 0 && (
        <Section title="Actus Starligue (sources)">
          <div className="flex flex-col gap-2">
            {Object.entries(status.providers.news).map(([sourceKey, s]) => (
              <div key={sourceKey} className="flex items-center gap-2 text-sm">
                <StatusDot ok={s.ok} />
                <span className="text-text">{sourceKey}</span>
                <span className="text-xs text-text-muted">
                  {s.lastRunAt
                    ? `dernière actu ingérée : ${new Date(s.lastRunAt).toLocaleString("fr-FR")}`
                    : "aucune actu ingérée pour l'instant"}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Recent matches */}
      {status?.recentMatches && status.recentMatches.length > 0 && (
        <Section title="Derniers matchs terminés">
          <div className="divide-y divide-border">
            {status.recentMatches.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-text-muted">J{m.gameweek}</span>
                <span className="text-text">{m.match}</span>
                <span
                  className={`text-xs tabular-nums ${m.statsCount > 0 ? "text-points-pos" : "text-text-muted"}`}
                >
                  {m.statsCount > 0 ? `${m.statsCount} notes` : "Pas de notes"}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Cron triggers */}
      <Section title="Déclencheurs manuels">
        <div className="flex flex-col gap-3">
          <CronButton
            label="Sync joueurs LNH"
            path="/api/cron/sync-players-lnh"
            description="Scrape noms + postes + clubs depuis lnh.fr (nécessite clubs avec slug LNH configuré)"
          />
          <CronButton
            label="Sync joueurs API-Sports"
            path="/api/cron/sync-players"
            description="Importe noms/prénoms depuis API-Sports (saison active)"
          />
          <CronButton
            label="Sync calendrier"
            path="/api/cron/sync-fixtures"
            description="Importe fixtures + résultats depuis API-Sports (saison active)"
          />
          <CronButton
            label="Sync résultats"
            path="/api/cron/sync-results"
            description="Met à jour les scores des matchs terminés"
          />
          <CronButton
            label="Sync notes LNH"
            path="/api/cron/sync-ratings"
            description="Scrape les notes LNH des matchs d'hier (expérimental)"
          />
          <CronButton
            label="Snapshot lineups"
            path="/api/cron/snapshot-lineups"
            description="Gèle les alignements dont la deadline est passée"
          />
          <CronButton
            label="Calculer les points"
            path="/api/cron/compute-scores"
            description="Calcule les points des journées avec toutes les notes"
          />
          <CronButton
            label="Sync classement LNH"
            path="/api/cron/sync-standings"
            description="Scrape le classement officiel Daikin StarLigue et snapshote la journée en cours"
          />
        </div>
      </Section>

      {/* Simulation 2025/26 : avancée/retour en arrière déplacés dans le widget
          "Classement général" du dashboard (mode simulation, admin uniquement) */}

      {/* Test avec saison 2024 */}
      <Section title="Test saison 2024/25 (API-Sports)">
        <div className="flex flex-col gap-3">
          <p className="text-xs text-text-muted">
            Pour tester avec des données réelles de la saison passée, utilisez le paramètre{" "}
            <code className="rounded bg-bg px-1 font-mono text-accent">?season=2024</code>
          </p>
          <CronButton
            label="Sync joueurs 2024"
            path="/api/cron/sync-players?season=2024"
            description="Importe les vrais noms des joueurs 2024/25"
          />
          <CronButton
            label="Sync fixtures 2024"
            path="/api/cron/sync-fixtures?season=2024"
            description="Importe le calendrier 2024/25 depuis API-Sports"
          />
          <CronButton
            label="Sync résultats 2024"
            path="/api/cron/sync-results?season=2024"
            description="Met à jour les scores de la saison 2024/25"
          />
        </div>
        <p className="mt-3 text-[10px] text-text-muted">
          Note : nécessite une saison "2024-2025" en base et que les clubs existent avec leurs shortNames corrects.
          Les matchs seront créés dans la saison correspondante si elle existe.
        </p>
      </Section>

      {/* LNH roster import */}
      <Section title="Import roster LNH (saison en cours)">
        <LnhRosterImport />
      </Section>

      {/* CSV imports */}
      <Section title="Import CSV">
        <div className="flex flex-col gap-3">
          <CsvImportForm type="clubs" label="Clubs" />
          <CsvImportForm type="players" label="Joueurs" />
          <CsvImportForm type="fixtures" label="Calendrier" />
          <CsvImportForm type="results" label="Résultats" />
          <CsvImportForm type="ratings" label="Notes LNH" />
        </div>
        <p className="mt-3 text-[10px] text-text-muted">
          Formats CSV : voir ARCHITECTURE.md §7.
        </p>
      </Section>

      {/* Config */}
      <Section title="Configuration du jeu">
        <div className="flex flex-col">
          {configs.map((c) => (
            <ConfigRow key={c.key} config={c} onSaved={loadConfigs} />
          ))}
        </div>
      </Section>

      {/* Recompute */}
      <Section title="Recalculer une journée">
        <RecomputeSection />
      </Section>
    </div>
  );
}
