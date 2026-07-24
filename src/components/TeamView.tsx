"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HandballPitch } from "@/components/pitch/HandballPitch";
import { Button } from "@/components/ui/Button";
import { JerseyBadge } from "@/components/jersey/JerseyBadge";
import { BonusPicker, type BonusType } from "@/components/BonusPicker";
import { MatchesStrip } from "@/components/dashboard/MatchesStrip";
import { StatLeadersPanel } from "@/components/dashboard/StatLeadersPanel";
import Link from "next/link";

interface SquadEntry {
  squadEntryId: string;
  playerId: string;
  firstName: string;
  lastName: string;
  position: string;
  photoUrl?: string | null;
  club: { shortName: string; logoUrl?: string | null };
  role: "STARTER" | "BENCH";
  marketValue: number;
}

interface StripMatch {
  id: string;
  homeClub: { id: string; shortName: string; name: string; logoUrl: string | null };
  awayClub: { id: string; shortName: string; name: string; logoUrl: string | null };
  homeScore: number | null;
  awayScore: number | null;
  kickoffAt: string | Date;
}

interface DashboardStrips {
  lastResults: { gameweekNumber: number | null; matches: StripMatch[] };
  upcoming: { gameweekNumber: number | null; matches: StripMatch[] };
}

interface TeamViewProps {
  mode?: "live" | "simulation";
  teamName: string;
  totalPoints: number;
  budget?: number;
  pointsToBudgetRate?: number;
  jerseyConfig?: unknown;
  leagueId: string;
  leagues?: { id: string; name: string }[];
  squad: SquadEntry[];
  lastScoredGameweek?: {
    number: number;
    points: number;
    lineupId: string;
    gameweekId: string;
  } | null;
  captainId?: string | null;
  transferWindowOpen?: boolean;
  seasonStarted?: boolean;
  dashboardStrips?: DashboardStrips | null;
  statsSeasonId?: string | null;
  pendingBonus?: BonusType | null;
  usedBonusTypes?: BonusType[];
  seasonBonusQuota?: number;
}

export function TeamView({
  mode = "live",
  teamName,
  totalPoints,
  budget = 0,
  pointsToBudgetRate = 0.1,
  jerseyConfig,
  leagueId,
  leagues,
  squad: initialSquad,
  lastScoredGameweek,
  captainId = null,
  transferWindowOpen = false,
  seasonStarted = false,
  dashboardStrips = null,
  statsSeasonId = null,
  pendingBonus: initialPendingBonus = null,
  usedBonusTypes = [],
  seasonBonusQuota = 3,
}: TeamViewProps) {
  const router = useRouter();
  const [squad, setSquad] = useState(initialSquad);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [points, setPoints] = useState(totalPoints);
  const [teamBudget, setTeamBudget] = useState(budget);
  const [convertAmount, setConvertAmount] = useState("");
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertSuccess, setConvertSuccess] = useState<string | null>(null);
  const [pendingBonus, setPendingBonus] = useState<BonusType | null>(initialPendingBonus);
  const [bonusSaving, setBonusSaving] = useState(false);
  const [bonusError, setBonusError] = useState<string | null>(null);

  async function switchLeague(id: string) {
    if (id === leagueId || switching) return;
    setSwitching(true);
    await fetch("/api/team/active-league", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leagueId: id }),
    });
    router.push(`/leagues/${id}`);
    router.refresh();
  }

  function swapRole(playerId: string) {
    const player = squad.find((p) => p.playerId === playerId);
    if (!player) return;

    // Swap with the partner of the same position
    const partner = squad.find(
      (p) => p.position === player.position && p.playerId !== player.playerId
    );
    if (!partner) return;

    setSquad((prev) =>
      prev.map((p) => {
        if (p.playerId === player.playerId) return { ...p, role: partner.role };
        if (p.playerId === partner.playerId) return { ...p, role: player.role };
        return p;
      })
    );
    setSaved(false);
    setError(null);
  }

  async function saveLineup() {
    setSaving(true);
    setError(null);
    const starters = squad.filter((p) => p.role === "STARTER").map((p) => p.playerId);
    try {
      const res = await fetch("/api/my-team/lineup", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starters, leagueId }),
      });
      const data = await res.json() as { data?: { success: boolean }; error?: { message: string } };
      if (data.data?.success) {
        setSaved(true);
      } else {
        setError(data.error?.message ?? "Erreur lors de la sauvegarde");
      }
    } catch {
      setError("Erreur réseau");
    }
    setSaving(false);
  }

  async function selectBonus(type: BonusType | null) {
    if (bonusSaving) return;
    setBonusSaving(true);
    setBonusError(null);
    try {
      const res = await fetch("/api/my-team/bonus", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, leagueId }),
      });
      const data = (await res.json()) as {
        data?: { pendingBonus: BonusType | null };
        error?: { message: string };
      };
      if (data.data) {
        setPendingBonus(data.data.pendingBonus);
      } else {
        setBonusError(data.error?.message ?? "Bonus impossible à activer");
      }
    } catch {
      setBonusError("Erreur réseau");
    }
    setBonusSaving(false);
  }

  async function convertPoints(amount: number) {
    if (!(amount > 0) || converting) return;
    setConverting(true);
    setConvertError(null);
    setConvertSuccess(null);
    try {
      const res = await fetch("/api/my-team/points-conversion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, leagueId }),
      });
      const data = (await res.json()) as {
        data?: { success: boolean; budgetGained: number; pointsSpent: number };
        error?: { message: string };
      };
      if (data.data?.success) {
        setPoints((p) => Math.round((p - data.data!.pointsSpent) * 10) / 10);
        setTeamBudget((b) => Math.round((b + data.data!.budgetGained) * 10) / 10);
        setConvertAmount("");
        setConvertSuccess(`+${data.data.budgetGained.toFixed(1)}M de budget`);
      } else {
        setConvertError(data.error?.message ?? "Conversion impossible");
      }
    } catch {
      setConvertError("Erreur réseau");
    }
    setConverting(false);
  }

  const starters = squad.filter((p) => p.role === "STARTER");
  const bench = squad.filter((p) => p.role === "BENCH");

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* Sélecteur de ligue — visible seulement si l'utilisateur a plusieurs équipes */}
      {leagues && leagues.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none]">
          {leagues.map((l) => (
            <button
              key={l.id}
              onClick={() => switchLeague(l.id)}
              disabled={switching}
              className={`pixel-corners-sm shrink-0 px-3 py-1 text-xs uppercase tracking-wide transition-colors ${
                l.id === leagueId
                  ? "bg-accent text-bg shadow-glow-accent"
                  : "border border-border text-text-muted hover:text-text"
              }`}
            >
              {l.name}
            </button>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <JerseyBadge jerseyConfig={jerseyConfig} size="lg" />
          <div className="min-w-0">
            <h1 className="text-2xl text-text">{teamName}</h1>
            <p className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-arcade text-3xl leading-none tracking-wide text-accent drop-shadow-[0_0_8px_rgba(45,212,191,0.6)]">
                {points}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-text-muted">pts saison</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex gap-2">
            <Link
              href={`/team/transfers?league=${leagueId}`}
              className="pixel-corners-sm border border-border bg-surface px-3 py-1.5 text-xs uppercase tracking-wide text-text-muted transition-colors hover:text-text"
            >
              Transferts
            </Link>
            <Link
              href={`/team/trades?league=${leagueId}`}
              className="pixel-corners-sm border border-border bg-surface px-3 py-1.5 text-xs uppercase tracking-wide text-text-muted transition-colors hover:text-text"
            >
              Trades
            </Link>
            {/* Rebuild complet interdit une fois la saison commencée — seuls
                Transferts/Trades modifient l'effectif ensuite (src/lib/squad/season-lock.ts) */}
            {!seasonStarted && (
              <Link
                href={`/team/build?league=${leagueId}`}
                className="pixel-corners-sm border border-border bg-surface px-3 py-1.5 text-xs uppercase tracking-wide text-text-muted transition-colors hover:text-text"
              >
                Modifier effectif
              </Link>
            )}
          </div>
          {mode === "live" && (
            <Link
              href={`/team/identity?league=${leagueId}&from=team`}
              className="text-[10px] text-text-muted transition-colors hover:text-text"
            >
              Personnaliser le maillot
            </Link>
          )}
        </div>
      </div>

      {/* Résultats dernière journée + prochains matchs (logos club uniquement) —
          encadrent le terrain, centre visuel de la page */}
      {dashboardStrips && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <MatchesStrip
            variant="results"
            gameweekNumber={dashboardStrips.lastResults.gameweekNumber}
            matches={dashboardStrips.lastResults.matches}
            size="square"
            fixedColumns={2}
          />
          <MatchesStrip
            variant="upcoming"
            gameweekNumber={dashboardStrips.upcoming.gameweekNumber}
            matches={dashboardStrips.upcoming.matches}
            size="square"
            fixedColumns={2}
          />
        </div>
      )}

      {/* Pitch + bench */}
      <HandballPitch starters={starters} bench={bench} onSwap={swapRole} />

      {/* Capitaine */}
      <div className="pixel-corners flex items-center justify-between border border-accent-secondary/25 bg-surface px-4 py-2.5">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-text-muted">Capitaine · ×2 pts</p>
          <p className="text-sm font-medium text-text">
            {(() => {
              const captain = squad.find((p) => p.playerId === captainId);
              return captain ? `${captain.firstName} ${captain.lastName}` : "Aucun";
            })()}
          </p>
        </div>
        {transferWindowOpen ? (
          <Link
            href={`/team/start?league=${leagueId}`}
            className="pixel-corners-sm border border-accent-secondary/50 px-3 py-1 text-xs uppercase tracking-wide text-accent-secondary shadow-glow-amber transition-colors hover:bg-accent-secondary/10"
          >
            Changer
          </Link>
        ) : (
          <span className="text-xs text-text-muted" title="Modifiable seulement en période de transfert">
            Verrouillé
          </span>
        )}
      </div>

      {/* Bonus de saison — 4 types, 1× chacun max, quota global de seasonBonusQuota
          activations sur la saison (voir FantasyBonusUsage/SimulationBonusUsage) */}
      <div className="pixel-corners border border-accent-secondary/25 bg-surface px-4 py-2.5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-widest text-text-muted">Bonus de saison</p>
          <p className="text-[10px] text-text-muted">
            {usedBonusTypes.length}/{seasonBonusQuota} utilisés
          </p>
        </div>
        <BonusPicker
          pendingBonus={pendingBonus}
          usedBonusTypes={usedBonusTypes}
          seasonBonusQuota={seasonBonusQuota}
          onSelect={selectBonus}
          disabled={bonusSaving}
        />
        {bonusError && <p className="mt-1.5 text-xs text-points-neg">{bonusError}</p>}
      </div>

      {/* Convertir des points en budget — visible seulement en fenêtre de transfert */}
      {transferWindowOpen ? (
        <div className="pixel-corners border border-accent-secondary/25 bg-surface px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-widest text-text-muted">Convertir des points en budget</p>
            <p className="text-xs text-text-muted">
              Budget : <span className="font-semibold text-accent-secondary">{teamBudget.toFixed(1)}M</span>
            </p>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            1 pt = {pointsToBudgetRate.toFixed(2)}M · solde convertible : {points} pt{points > 1 ? "s" : ""}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={0.1}
              max={Math.max(points, 0)}
              step={0.1}
              value={convertAmount}
              onChange={(e) => setConvertAmount(e.target.value)}
              placeholder="Points à convertir"
              className="w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <button
              onClick={() => setConvertAmount(String(points))}
              disabled={points <= 0}
              className="pixel-corners-sm shrink-0 border border-border px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
            >
              Tout
            </button>
            <button
              onClick={() => convertPoints(parseFloat(convertAmount))}
              disabled={converting || !convertAmount || !(parseFloat(convertAmount) > 0) || parseFloat(convertAmount) > points}
              className="pixel-corners-sm shrink-0 bg-accent-secondary px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-bg transition-colors hover:bg-accent-secondary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {converting ? "…" : "Convertir"}
            </button>
          </div>
          {convertAmount && parseFloat(convertAmount) > 0 && (
            <p className="mt-1.5 text-xs text-text-muted">
              → +{(Math.round(parseFloat(convertAmount) * pointsToBudgetRate * 10) / 10).toFixed(1)}M de budget
            </p>
          )}
          {convertError && <p className="mt-1.5 text-xs text-points-neg">{convertError}</p>}
          {convertSuccess && <p className="mt-1.5 text-xs text-points-pos">{convertSuccess}</p>}
        </div>
      ) : (
        <p className="text-center text-xs text-text-muted">
          Convertir des points en budget est possible pendant une fenêtre de transfert.
        </p>
      )}

      {/* Last scored gameweek card */}
      {lastScoredGameweek && (
        <Link
          href={`/team/history/${lastScoredGameweek.gameweekId}?league=${leagueId}`}
          className="pixel-corners flex items-center justify-between border border-border bg-surface px-4 py-3 transition-colors hover:border-accent/40"
        >
          <div>
            <p className="text-xs uppercase tracking-widest text-text-muted">
              Dernière journée
            </p>
            <p className="mt-0.5 text-sm font-medium text-text">
              Journée {lastScoredGameweek.number}
            </p>
          </div>
          <div className="text-right">
            <p
              className={`font-arcade text-4xl leading-none tracking-wide drop-shadow-[0_0_8px_currentColor] ${
                lastScoredGameweek.points >= 0 ? "text-points-pos" : "text-points-neg"
              }`}
            >
              {lastScoredGameweek.points > 0
                ? `+${lastScoredGameweek.points}`
                : lastScoredGameweek.points}
            </p>
            <p className="mt-0.5 text-xs text-text-muted">pts · voir détail →</p>
          </div>
        </Link>
      )}

      {/* History link */}
      <Link
        href={`/team/history?league=${leagueId}`}
        className="text-center text-xs text-text-muted transition-colors hover:text-text"
      >
        Voir l'historique complet
      </Link>

      {/* Save button */}
      <div>
        {error && <p className="mb-2 text-center text-sm text-points-neg">{error}</p>}
        {saved && (
          <p className="mb-2 text-center text-sm text-points-pos">
            Alignement sauvegardé ✓
          </p>
        )}
        <Button
          onClick={saveLineup}
          disabled={saving || saved}
          variant="primary"
          size="lg"
          className="w-full"
        >
          {saving ? "Sauvegarde…" : saved ? "Alignement sauvegardé" : "Sauvegarder l'alignement"}
        </Button>
      </div>

      {statsSeasonId && <StatLeadersPanel seasonId={statsSeasonId} context={mode} />}
    </div>
  );
}
