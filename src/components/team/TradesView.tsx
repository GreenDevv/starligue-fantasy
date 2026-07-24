"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Position } from "@/lib/squad/validation";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { ClubLogo } from "@/components/ui/ClubLogo";
import { PositionBadge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { SeasonMode } from "@/lib/team/active-team-context";

interface SquadPlayerRow {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  marketValue: number;
  photoUrl?: string | null;
  isActive: boolean;
  club: { shortName: string; logoUrl?: string | null };
}

interface StandingEntry {
  teamId: string;
  userName: string;
  teamName: string;
}

interface TradePlayer {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  marketValue: number;
}

interface TradeProposalRow {
  id: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "EXPIRED";
  expiresAt: string;
  budgetAdjustment: number;
  direction: "incoming" | "outgoing";
  proposingTeam: { id: string; name: string };
  receivingTeam: { id: string; name: string };
  offeredPlayers: TradePlayer[];
  requestedPlayers: TradePlayer[];
}

const STATUS_LABEL: Record<TradeProposalRow["status"], string> = {
  PENDING: "En attente",
  ACCEPTED: "Accepté",
  REJECTED: "Refusé",
  CANCELLED: "Annulé",
  EXPIRED: "Expiré",
};

export function TradesView({ mode }: { mode: SeasonMode }) {
  const router = useRouter();
  const leagueId = useSearchParams().get("league");
  const leagueSuffix = leagueId ? `?league=${leagueId}` : "";
  const isSimulation = mode === "simulation";

  const [loading, setLoading] = useState(true);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [mySquad, setMySquad] = useState<SquadPlayerRow[]>([]);
  const [standings, setStandings] = useState<StandingEntry[]>([]);
  const [proposals, setProposals] = useState<TradeProposalRow[]>([]);

  const [opponentId, setOpponentId] = useState<string>("");
  const [opponentSquad, setOpponentSquad] = useState<SquadPlayerRow[]>([]);
  const [loadingOpponent, setLoadingOpponent] = useState(false);
  const [offered, setOffered] = useState<Set<string>>(new Set());
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [budgetAdjustment, setBudgetAdjustment] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function loadAll() {
    fetch(`/api/my-team${leagueSuffix}`)
      .then((r) => r.json())
      .then((teamRes: { data?: { id: string; leagueId: string; squad: Array<{ player: SquadPlayerRow }> } }) => {
        if (!teamRes.data) return;
        setMyTeamId(teamRes.data.id);
        setMySquad(teamRes.data.squad.map((s) => s.player));
        return fetch(`/api/leagues/${teamRes.data.leagueId}`).then((r) => r.json());
      })
      .then((leagueRes?: { data?: { standings: StandingEntry[] } }) => {
        if (leagueRes?.data) setStandings(leagueRes.data.standings);
      })
      .finally(() => setLoading(false));

    fetch(`/api/trades${leagueSuffix}`)
      .then((r) => r.json())
      .then((res: { data?: TradeProposalRow[] }) => setProposals(res.data ?? []));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadAll, [leagueSuffix]);

  useEffect(() => {
    if (!opponentId || !leagueId) {
      setOpponentSquad([]);
      return;
    }
    setLoadingOpponent(true);
    fetch(`/api/leagues/${leagueId}/teams/${opponentId}/squad`)
      .then((r) => r.json())
      .then((res: { data?: { squad: SquadPlayerRow[] } }) => setOpponentSquad(res.data?.squad ?? []))
      .finally(() => setLoadingOpponent(false));
  }, [opponentId, leagueId]);

  const opponents = useMemo(() => standings.filter((s) => s.teamId !== myTeamId), [standings, myTeamId]);

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  async function submitProposal() {
    if (!opponentId) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receivingTeamId: opponentId,
          offeredPlayerIds: Array.from(offered),
          requestedPlayerIds: Array.from(requested),
          budgetAdjustment: parseFloat(budgetAdjustment) || 0,
          ...(leagueId ? { leagueId } : {}),
        }),
      });
      const data = (await res.json()) as { data?: { id: string }; error?: { message: string } };
      if (data.data) {
        setSuccess("Proposition envoyée.");
        setOffered(new Set());
        setRequested(new Set());
        setBudgetAdjustment("0");
        loadAll();
      } else {
        setError(data.error?.message ?? "Proposition impossible");
      }
    } catch {
      setError("Erreur réseau");
    }
    setSubmitting(false);
  }

  async function respond(id: string, action: "accept" | "reject" | "cancel") {
    await fetch(`/api/trades/${id}/${action}`, { method: "POST" });
    loadAll();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-text-muted">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          {isSimulation && (
            <p className="text-xs font-semibold uppercase tracking-widest text-accent-secondary">Mode Simulation</p>
          )}
          <h1 className="text-2xl text-text">Trades</h1>
        </div>
        <button onClick={() => router.push(leagueId ? `/leagues/${leagueId}` : "/leagues")} className="text-xs text-text-muted hover:text-text">
          ← Mon équipe
        </button>
      </div>

      <div className="rounded-lg border border-points-pos/40 bg-points-pos/10 px-4 py-3 text-sm text-points-pos">
        Les trades sont autorisés toute la saison, même en dehors des fenêtres de transfert — un trade accepté
        s&apos;exécute immédiatement.
      </div>

      {/* Proposer un trade */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">Proposer un trade</p>

        <select
          value={opponentId}
          onChange={(e) => {
            setOpponentId(e.target.value);
            setOffered(new Set());
            setRequested(new Set());
          }}
          className={cn(
            "pixel-corners-sm border border-border bg-surface px-3 py-2 text-sm text-text transition-shadow focus:outline-none",
            isSimulation ? "focus:border-accent-secondary focus:shadow-glow-amber" : "focus:border-accent focus:shadow-glow-accent"
          )}
        >
          <option value="">Choisir un adversaire…</option>
          {opponents.map((o) => (
            <option key={o.teamId} value={o.teamId}>
              {o.teamName} ({o.userName})
            </option>
          ))}
        </select>

        {opponentId && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SquadPicker title="Tu offres" players={mySquad} selected={offered} onToggle={(id) => toggle(offered, setOffered, id)} isSimulation={isSimulation} />
              <SquadPicker
                title="Tu demandes"
                players={opponentSquad}
                selected={requested}
                onToggle={(id) => toggle(requested, setRequested, id)}
                loading={loadingOpponent}
                isSimulation={isSimulation}
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted">Ajustement budget (tu donnes si positif)</label>
              <input
                type="number"
                step={0.1}
                value={budgetAdjustment}
                onChange={(e) => setBudgetAdjustment(e.target.value)}
                className={cn(
                  "pixel-corners-sm w-28 border border-border bg-surface px-2 py-1 text-sm text-text transition-shadow focus:outline-none",
                  isSimulation ? "focus:border-accent-secondary focus:shadow-glow-amber" : "focus:border-accent focus:shadow-glow-accent"
                )}
              />
              <span className="text-xs text-text-muted">M</span>
            </div>

            {error && <p className="text-sm text-points-neg">{error}</p>}
            {success && <p className="text-sm text-points-pos">{success}</p>}

            <button
              onClick={submitProposal}
              disabled={submitting || (offered.size === 0 && requested.size === 0)}
              className={cn(
                "pixel-corners-sm px-4 py-2 text-sm font-semibold uppercase tracking-wide text-bg transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                isSimulation ? "bg-accent-secondary hover:bg-accent-secondary/90" : "bg-accent hover:bg-accent/90"
              )}
            >
              {submitting ? "Envoi…" : "Proposer le trade"}
            </button>
          </>
        )}
      </div>

      {/* Mes propositions */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">Mes propositions</p>
        {proposals.length === 0 ? (
          <p className="text-sm text-text-muted">Aucune proposition pour le moment.</p>
        ) : (
          proposals.map((p) => (
            <div key={p.id} className="pixel-corners flex flex-col gap-2 border border-border bg-surface px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-text">
                  {p.direction === "outgoing" ? `Vers ${p.receivingTeam.name}` : `De ${p.proposingTeam.name}`}
                </p>
                <span className="pixel-corners-sm border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
                  {STATUS_LABEL[p.status]}
                </span>
              </div>
              <p className="text-xs text-text-muted">
                {p.direction === "outgoing" ? "Tu offres" : "Il t'offre"} :{" "}
                {p.offeredPlayers.map((pl) => `${pl.firstName} ${pl.lastName}`).join(", ") || "—"}
                {" · "}
                {p.direction === "outgoing" ? "tu demandes" : "il te demande"} :{" "}
                {p.requestedPlayers.map((pl) => `${pl.firstName} ${pl.lastName}`).join(", ") || "—"}
                {p.budgetAdjustment !== 0 && ` · ${p.budgetAdjustment > 0 ? "+" : ""}${p.budgetAdjustment.toFixed(1)}M`}
              </p>
              {p.status === "PENDING" && (
                <div className="flex gap-2">
                  {p.direction === "incoming" ? (
                    <>
                      <button
                        onClick={() => respond(p.id, "accept")}
                        className="pixel-corners-sm bg-points-pos/15 px-3 py-1 text-xs font-semibold text-points-pos transition-colors hover:bg-points-pos/25"
                      >
                        Accepter
                      </button>
                      <button
                        onClick={() => respond(p.id, "reject")}
                        className="pixel-corners-sm border border-border px-3 py-1 text-xs text-text-muted transition-colors hover:text-text"
                      >
                        Refuser
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => respond(p.id, "cancel")}
                      className="pixel-corners-sm border border-border px-3 py-1 text-xs text-text-muted transition-colors hover:text-text"
                    >
                      Annuler
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SquadPicker({
  title,
  players,
  selected,
  onToggle,
  loading = false,
  isSimulation = false,
}: {
  title: string;
  players: SquadPlayerRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  loading?: boolean;
  isSimulation?: boolean;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-text-muted">{title}</p>
      <div className="pixel-corners max-h-72 overflow-y-auto border border-border bg-surface">
        {loading ? (
          <p className="py-6 text-center text-sm text-text-muted">Chargement…</p>
        ) : players.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">—</p>
        ) : (
          players.map((p) => {
            const isSelected = selected.has(p.id);
            return (
              <button
                key={p.id}
                onClick={() => onToggle(p.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 border-b border-border px-3 py-2 text-left transition-colors last:border-b-0",
                  isSelected ? (isSimulation ? "bg-accent-secondary/10" : "bg-accent/10") : "hover:bg-border/20"
                )}
              >
                <PlayerAvatar player={p} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">
                    {p.firstName} {p.lastName}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-text-muted">
                    <ClubLogo club={p.club} size="xs" />
                    {p.club.shortName}
                  </p>
                </div>
                <PositionBadge position={p.position} className="shrink-0" />
                <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums text-accent-secondary">
                  {p.marketValue.toFixed(1)}M
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
