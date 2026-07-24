import { HandballPitch } from "@/components/pitch/HandballPitch";
import type { BestXIEntry } from "@/lib/players/compute-best-xi";

// Lecture seule (pas de onSwap/onEmptySlotClick) — les postes sans joueur noté
// restent vides, normal en tout début de saison (voir computeBestXI).
export function BestXIWidget({ entries }: { entries: BestXIEntry[] }) {
  const starters = entries.map((e) => ({
    playerId: e.playerId,
    firstName: e.firstName,
    lastName: e.lastName,
    position: e.position,
    photoUrl: e.photoUrl,
    club: e.club,
    role: "STARTER" as const,
    points: e.points,
  }));

  return (
    <div className="pixel-corners border border-border bg-surface p-3">
      <p className="mb-2 text-[10px] uppercase tracking-widest text-text-muted">
        Équipe type de la saison · meilleurs joueurs par poste
      </p>
      {entries.length === 0 ? (
        <p className="py-4 text-center text-xs text-text-muted">Aucune journée notée pour l'instant.</p>
      ) : (
        <HandballPitch starters={starters} bench={[]} benchLabel="" />
      )}
    </div>
  );
}
