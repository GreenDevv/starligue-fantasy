"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Position } from "@/lib/squad/validation";
import { HandballPitch } from "@/components/pitch/HandballPitch";
import { CaptainPicker } from "@/components/CaptainPicker";
import { Skeleton, SkeletonRow } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import type { SeasonMode } from "@/lib/team/active-team-context";

interface SquadEntry {
  playerId: string;
  firstName: string;
  lastName: string;
  position: Position;
  photoUrl?: string | null;
  photoOffsetX?: number;
  photoOffsetY?: number;
  photoZoom?: number;
  club: { shortName: string; logoUrl?: string | null };
  role: "STARTER" | "BENCH";
}

interface TeamResponse {
  data?: {
    captainId: string | null;
    squad: Array<{
      role: string;
      player: {
        id: string;
        firstName: string;
        lastName: string;
        position: Position;
        photoUrl?: string | null;
        photoOffsetX?: number;
        photoOffsetY?: number;
        photoZoom?: number;
        club: { shortName: string; logoUrl?: string | null };
      };
    }>;
  };
}

export function StartView({ mode }: { mode: SeasonMode }) {
  const router = useRouter();
  const leagueId = useSearchParams().get("league");
  const leagueSuffix = leagueId ? `?league=${leagueId}` : "";
  const isSimulation = mode === "simulation";
  const [squad, setSquad] = useState<SquadEntry[]>([]);
  const [captainId, setCaptainId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/my-team${leagueSuffix}`)
      .then((r) => r.json())
      .then((data: TeamResponse) => {
        if (data.data) {
          const entries: SquadEntry[] = data.data.squad.map((s) => ({
            playerId: s.player.id,
            firstName: s.player.firstName,
            lastName: s.player.lastName,
            position: s.player.position,
            photoUrl: s.player.photoUrl,
            photoOffsetX: s.player.photoOffsetX,
            photoOffsetY: s.player.photoOffsetY,
            photoZoom: s.player.photoZoom,
            club: s.player.club,
            role: s.role as "STARTER" | "BENCH",
          }));

          // Effectif fraîchement créé (tout le monde BENCH) : propose une première
          // formation par défaut (1er joueur de chaque poste) pour ne pas laisser
          // le terrain vide — librement modifiable ensuite.
          if (!entries.some((e) => e.role === "STARTER")) {
            const seenPositions = new Set<Position>();
            for (const e of entries) {
              if (!seenPositions.has(e.position)) {
                e.role = "STARTER";
                seenPositions.add(e.position);
              }
            }
          }

          setSquad(entries);
          setCaptainId(data.data.captainId);
        }
        setLoading(false);
      });
  }, [leagueSuffix]);

  function swapRole(playerId: string) {
    const player = squad.find((p) => p.playerId === playerId);
    if (!player) return;
    const partner = squad.find((p) => p.position === player.position && p.playerId !== playerId);
    if (!partner) return;

    setSquad((prev) =>
      prev.map((p) => {
        if (p.playerId === player.playerId) return { ...p, role: partner.role };
        if (p.playerId === partner.playerId) return { ...p, role: player.role };
        return p;
      })
    );
  }

  async function handleSubmit() {
    if (!captainId) {
      setError("Choisis un capitaine avant de valider");
      return;
    }
    setSubmitting(true);
    setError(null);
    const starters = squad.filter((p) => p.role === "STARTER").map((p) => p.playerId);
    try {
      const lineupRes = await fetch("/api/my-team/lineup", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starters, ...(leagueId ? { leagueId } : {}) }),
      });
      const lineupData = (await lineupRes.json()) as { data?: { success: boolean }; error?: { code?: string; message: string } };
      if (!lineupData.data?.success) {
        if (lineupData.error?.code === "NO_ACTIVE_LEAGUE") {
          router.push("/leagues");
          return;
        }
        setError(lineupData.error?.message ?? "Erreur lors de la sauvegarde de l'alignement");
        setSubmitting(false);
        return;
      }

      const captainRes = await fetch("/api/my-team/captain", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: captainId, ...(leagueId ? { leagueId } : {}) }),
      });
      const captainData = (await captainRes.json()) as { data?: { captainId: string }; error?: { message: string } };
      if (!captainData.data) {
        setError(captainData.error?.message ?? "Erreur lors de la désignation du capitaine");
        setSubmitting(false);
        return;
      }

      router.push(leagueId ? `/leagues/${leagueId}` : "/leagues");
    } catch {
      setError("Erreur réseau");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-64 w-full" />
        <div className="pixel-corners border border-border bg-surface">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} className={i > 0 ? "border-t border-border" : ""} />
          ))}
        </div>
      </div>
    );
  }

  const starters = squad.filter((p) => p.role === "STARTER");
  const bench = squad.filter((p) => p.role === "BENCH");

  return (
    <div className="flex flex-col gap-6 pb-36">
      <div>
        {isSimulation && (
          <p className="text-xs font-semibold uppercase tracking-widest text-accent-secondary">Mode Simulation</p>
        )}
        <h1 className="text-2xl text-text">Compose ton équipe de départ</h1>
        <p className="mt-1 text-sm text-text-muted">
          Choisis tes 7 titulaires et ton capitaine (×2 points). Le capitaine ne
          pourra être changé qu'en période de transfert.
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
          Titulaires · tap un joueur pour échanger avec son remplaçant
        </p>
        <HandballPitch starters={starters} bench={bench} captainId={captainId} onSwap={swapRole} />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
          Capitaine · ×2 points s'il est titulaire à la journée
        </p>
        <CaptainPicker squad={squad} captainId={captainId} onSelect={setCaptainId} />
      </div>

      {/* bottom décalé au-dessus de la MobileTabBar (fixed elle aussi, ~52px + zone
          de sécurité iOS) sous sm: — sinon le bouton se retrouve sous la nav mobile,
          inaccessible. sm:bottom-0 replaque au ras du bas quand la tab bar disparaît. */}
      <div className="fixed inset-x-0 bottom-[calc(52px+env(safe-area-inset-bottom))] border-t border-border bg-bg/95 px-4 py-4 backdrop-blur-sm sm:bottom-0">
        <div className="mx-auto max-w-2xl">
          {error && <p className="mb-2 text-center text-sm text-points-neg">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={submitting || !captainId}
            className={cn(
              "w-full rounded-lg py-3 font-display uppercase tracking-wide text-bg transition-[transform,box-shadow,background-color] duration-100 disabled:cursor-not-allowed disabled:opacity-40",
              isSimulation
                ? "bg-accent-secondary shadow-[0_4px_0_0_theme(colors.accent.secondary/0.4),0_0_16px_rgba(245,158,11,0.35)] hover:bg-accent-secondary/90 active:translate-y-[3px] active:shadow-[0_1px_0_0_theme(colors.accent.secondary/0.4)]"
                : "bg-accent shadow-[0_4px_0_0_theme(colors.accent.DEFAULT/0.4),0_0_16px_rgba(45,212,191,0.35)] hover:bg-accent/90 active:translate-y-[3px] active:shadow-[0_1px_0_0_theme(colors.accent.DEFAULT/0.4)]"
            )}
          >
            {submitting ? "Validation…" : "C'est parti →"}
          </button>
        </div>
      </div>
    </div>
  );
}
