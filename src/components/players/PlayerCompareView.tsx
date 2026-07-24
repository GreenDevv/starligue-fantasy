"use client";

import { useEffect, useState } from "react";
import { PositionBadge } from "@/components/ui/Badge";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { ValueHistoryChart } from "@/components/charts/ValueHistoryChart";
import { PlayerStatsChart } from "@/components/charts/PlayerStatsChart";
import type { PlayerDetailData, PlayerDetailMatchLogEntry } from "@/lib/players/player-detail";
import type { Position } from "@/lib/squad/validation";

interface SearchResult {
  id: string;
  firstName: string;
  lastName: string;
  club: { shortName: string; name?: string; logoUrl?: string | null };
}

// Vue complète de /players/[id] — orchestrateur client unique pour que la
// comparaison à un second joueur s'applique à TOUTE la page (en-tête, valeur,
// stats saison, stats par journée, historique LNH, match par match) et pas
// seulement au graphique multi-séries. Le joueur principal arrive déjà résolu en
// props (SSR, anti-spoiler simulation déjà appliqué côté serveur) ; le joueur
// comparé est chargé au clic via GET /api/players/[id]/detail, qui applique
// exactement la même logique (fonction partagée getPlayerDetailData).
export function PlayerCompareView({ primary }: { primary: PlayerDetailData }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [compare, setCompare] = useState<PlayerDetailData | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/players?search=${encodeURIComponent(query)}&seasonId=${primary.seasonId}&perPage=8`, {
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((json: { data?: { players?: SearchResult[] } }) => {
          const players = json.data?.players ?? [];
          setResults(players.filter((p) => p.id !== primary.id));
        })
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, primary.seasonId, primary.id]);

  async function selectCompare(p: SearchResult) {
    setPanelOpen(false);
    setQuery("");
    setResults([]);
    setLoadingCompare(true);
    try {
      const res = await fetch(`/api/players/${p.id}/detail`);
      const json: { data?: PlayerDetailData } = await res.json();
      if (json.data) setCompare(json.data);
    } finally {
      setLoadingCompare(false);
    }
  }

  const primaryLabel = `${primary.firstName} ${primary.lastName}`;
  const compareLabel = compare ? `${compare.firstName} ${compare.lastName}` : undefined;

  const compareByKey = new Map(compare?.seasonStatTotals.map((s) => [s.key, s]) ?? []);
  const statRows = primary.seasonStatTotals
    .map((s) => ({ key: s.key, label: s.label, category: s.category, a: s.total, b: compareByKey.get(s.key)?.total ?? 0 }))
    .filter((r) => r.a > 0 || r.b > 0);
  const showSeasonStats = compare
    ? statRows.length > 0 || primary.seasonShotPercentage !== null || compare.seasonShotPercentage !== null
    : primary.hasSeasonStats;

  return (
    <div className="flex flex-col gap-5">
      {/* Comparaison — applique à toute la page ci-dessous */}
      <div className="flex items-center gap-2">
        {compare ? (
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <span>
              Comparé à <span className="font-semibold text-text">{compareLabel}</span>
            </span>
            <button type="button" onClick={() => setCompare(null)} className="text-text-muted underline hover:text-text">
              Retirer
            </button>
          </div>
        ) : (
          <div className="relative">
            <button
              type="button"
              onClick={() => setPanelOpen((v) => !v)}
              className="pixel-corners-sm border border-border px-2 py-1 text-[11px] text-text-muted transition-colors hover:text-text"
            >
              + Comparer à un joueur
            </button>
            {panelOpen && (
              <div className="pixel-corners-sm absolute left-0 top-full z-30 mt-1 w-56 border border-border bg-surface p-2 shadow-lg">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Nom du joueur..."
                  className="w-full border border-border bg-bg px-2 py-1 text-xs text-text outline-none focus:border-accent"
                />
                <div className="mt-1 max-h-48 overflow-y-auto">
                  {searching && <p className="px-1 py-1 text-[11px] text-text-muted">Recherche...</p>}
                  {!searching && query.trim().length >= 2 && results.length === 0 && (
                    <p className="px-1 py-1 text-[11px] text-text-muted">Aucun joueur trouvé.</p>
                  )}
                  {results.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectCompare(p)}
                      className="flex w-full items-center gap-2 px-1 py-1.5 text-left text-xs text-text hover:bg-bg"
                    >
                      <span className="truncate">
                        {p.firstName} {p.lastName}
                      </span>
                      <span className="ml-auto shrink-0 text-text-muted">{p.club.shortName}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {loadingCompare && <span className="text-[11px] text-text-muted">Chargement...</span>}
      </div>

      {/* Player header — hero, distinct du reste (glow ambre sur la valeur, la
          stat qui compte le plus pour un joueur fantasy). En comparaison : deux
          mini-en-têtes côte à côte plutôt que la version complète, pour rester
          lisible en largeur mobile. */}
      {!compare ? (
        <div className="pixel-corners border border-border bg-surface p-4 shadow-[0_0_24px_rgba(245,158,11,0.08)]">
          <div className="flex items-start gap-4">
            <PlayerAvatar player={{ ...primary, position: primary.position as Position }} size="xl" />
            <div className="flex flex-1 items-start justify-between gap-4">
              <div>
                <div className="mb-2">
                  <PositionBadge position={primary.position} />
                </div>
                <h1 className="text-2xl text-text">{primaryLabel}</h1>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-text-muted">
                  <ClubLogo club={primary.club} size="xs" />
                  {primary.club.name}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-arcade text-3xl leading-none tracking-wide text-accent-secondary drop-shadow-[0_0_8px_currentColor]">
                  {primary.marketValue.toFixed(1)}M
                </p>
                {primary.avgRating !== null && (
                  <p className="mt-1 text-xs tabular-nums text-text-muted">moy. {primary.avgRating.toFixed(1)}/10</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {[primary, compare].map((p) => (
            <div
              key={p.id}
              className="pixel-corners border border-border bg-surface p-3 shadow-[0_0_24px_rgba(245,158,11,0.08)]"
            >
              <div className="flex flex-col items-center gap-2 text-center">
                <PlayerAvatar player={{ ...p, position: p.position as Position }} size="lg" />
                <div>
                  <div className="mb-1 flex justify-center">
                    <PositionBadge position={p.position} />
                  </div>
                  <h2 className="text-sm font-semibold text-text">
                    {p.firstName} {p.lastName}
                  </h2>
                  <p className="mt-0.5 flex items-center justify-center gap-1 text-xs text-text-muted">
                    <ClubLogo club={p.club} size="xs" />
                    {p.club.shortName}
                  </p>
                </div>
                <div>
                  <p className="font-arcade text-lg leading-none tracking-wide text-accent-secondary drop-shadow-[0_0_8px_currentColor]">
                    {p.marketValue.toFixed(1)}M
                  </p>
                  {p.avgRating !== null && (
                    <p className="mt-1 text-[11px] tabular-nums text-text-muted">moy. {p.avgRating.toFixed(1)}/10</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Évolution de la valeur marchande */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">Évolution de la valeur</p>
        <div className="pixel-corners border border-border bg-surface p-4">
          <ValueHistoryChart
            entries={primary.valueHistoryPoints}
            primaryLabel={primaryLabel}
            compareEntries={compare?.valueHistoryPoints}
            compareLabel={compareLabel}
          />
        </div>
      </div>

      {/* Stats saison cumulées */}
      {showSeasonStats && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
            Stats saison {primary.seasonLabel}
          </p>
          {!compare ? (
            <div className="grid grid-cols-2 gap-2 pixel-corners border border-border bg-surface p-4">
              {primary.seasonStatTotals
                .filter((s) => s.total > 0)
                .map((s) => (
                  <div key={s.key} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-text-muted">{s.label}</span>
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        s.category === "malus" ? "text-points-neg" : "text-text"
                      }`}
                    >
                      {s.total}
                    </span>
                  </div>
                ))}
              {primary.seasonShotPercentage !== null && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-text-muted">% tirs</span>
                  <span className="text-sm font-semibold tabular-nums text-text">{primary.seasonShotPercentage}%</span>
                </div>
              )}
            </div>
          ) : (
            <div className="pixel-corners overflow-hidden border border-border bg-surface">
              <div className="grid grid-cols-3 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                <span></span>
                <span className="truncate text-center">{primaryLabel}</span>
                <span className="truncate text-center">{compareLabel}</span>
              </div>
              <div className="divide-y divide-border">
                {statRows.map((row) => (
                  <div key={row.key} className="grid grid-cols-3 items-center px-3 py-2 text-sm">
                    <span className="text-xs text-text-muted">{row.label}</span>
                    <span
                      className={`text-center font-semibold tabular-nums ${
                        row.category === "malus" ? "text-points-neg" : "text-text"
                      }`}
                    >
                      {row.a}
                    </span>
                    <span
                      className={`text-center font-semibold tabular-nums ${
                        row.category === "malus" ? "text-points-neg" : "text-text"
                      }`}
                    >
                      {row.b}
                    </span>
                  </div>
                ))}
                {(primary.seasonShotPercentage !== null || compare.seasonShotPercentage !== null) && (
                  <div className="grid grid-cols-3 items-center px-3 py-2 text-sm">
                    <span className="text-xs text-text-muted">% tirs</span>
                    <span className="text-center font-semibold tabular-nums text-text">
                      {primary.seasonShotPercentage !== null ? `${primary.seasonShotPercentage}%` : "—"}
                    </span>
                    <span className="text-center font-semibold tabular-nums text-text">
                      {compare.seasonShotPercentage !== null ? `${compare.seasonShotPercentage}%` : "—"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats par journée (graphique multi-séries) */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
          Stats par journée — {primary.isSimulation ? "Simulation" : "Saison"} {primary.seasonLabel}
        </p>
        <div className="pixel-corners border border-border bg-surface p-4">
          <PlayerStatsChart
            entries={primary.chartEntries}
            primaryLabel={primaryLabel}
            compareEntries={compare?.chartEntries}
            compareLabel={compareLabel}
          />
        </div>
      </div>

      {/* Historique Score LNH (saisons précédentes, hors saison fantasy active) */}
      <LnhHistorySection player={primary} label={compare ? primaryLabel : undefined} />
      {compare && <LnhHistorySection player={compare} label={compareLabel} />}

      {/* Stats match par match */}
      <MatchLogSection player={primary} label={compare ? primaryLabel : undefined} />
      {compare && <MatchLogSection player={compare} label={compareLabel} />}
    </div>
  );
}

function LnhHistorySection({ player, label }: { player: PlayerDetailData; label?: string }) {
  if (player.lnhSeasonStats.length === 0) {
    return (
      <div className="pixel-corners-sm border border-dashed border-border px-4 py-3 text-center">
        <p className="text-xs text-text-muted">
          {label ? `${label} — ` : ""}Nouveau en Daikin StarLigue — pas d'historique de score LNH.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
        Historique LNH{label ? ` — ${label}` : ""}
      </p>
      <div className="pixel-corners overflow-hidden border border-border bg-surface">
        <div className="divide-y divide-border">
          <div className="grid grid-cols-3 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            <span>Saison</span>
            <span className="text-center">Matchs</span>
            <span className="text-right">Score LNH moy.</span>
          </div>
          {player.lnhSeasonStats.map((s) => (
            <div key={s.id} className="grid grid-cols-3 items-center px-3 py-2.5 text-sm">
              <span className="text-text">{s.seasonLabel}</span>
              <span className="text-center tabular-nums text-text-muted">{s.matchesPlayed}</span>
              <span className="text-right font-semibold tabular-nums text-accent">{s.avgLnhScore.toFixed(1)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MatchLogSection({ player, label }: { player: PlayerDetailData; label?: string }) {
  if (player.matchLog.length === 0) {
    return (
      <div className="pixel-corners border border-border bg-surface px-4 py-8 text-center">
        <p className="text-sm text-text-muted">
          {label ? `${label} — ` : ""}Aucune statistique disponible pour l'instant.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
        Statistiques match par match{label ? ` — ${label}` : ""}
      </p>
      <div className="pixel-corners overflow-hidden border border-border bg-surface">
        <div className="divide-y divide-border">
          <div className="grid grid-cols-4 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            <span>J.</span>
            <span>Adv.</span>
            <span className="text-center">Note</span>
            <span className="text-right">Pts (tit.)</span>
          </div>
          {player.matchLog.map((s: PlayerDetailMatchLogEntry) => (
            <div key={s.id} className="grid grid-cols-4 items-center px-3 py-2.5 text-sm">
              <span className="text-text-muted tabular-nums">{s.gameweekNumber}</span>
              <span className="text-text-muted">{s.opponent}</span>
              <span className="text-center tabular-nums">
                {s.lnhRating !== null ? (
                  <span
                    className={
                      s.lnhRating >= 7 ? "font-semibold text-points-pos" : s.lnhRating < 5 ? "text-points-neg" : "text-text"
                    }
                  >
                    {s.lnhRating.toFixed(1)}
                  </span>
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </span>
              <span className="text-right tabular-nums">
                {s.pts !== null ? (
                  <span className={s.pts > 0 ? "font-semibold text-points-pos" : s.pts < 0 ? "text-points-neg" : "text-text-muted"}>
                    {s.pts > 0 ? `+${s.pts}` : s.pts}
                  </span>
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
