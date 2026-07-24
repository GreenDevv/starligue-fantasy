import { HandballPitch } from "@/components/pitch/HandballPitch";
import type { TeamOfWeekCardData } from "@/lib/news/get-weekly-cards";

// Lecture seule (comme BestXIWidget) — équipe type de LA SEMAINE, pas de la saison.
export function StarligueBestXICard({ gameweekNumber, entries }: TeamOfWeekCardData) {
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
        Équipe type · journée {gameweekNumber}
      </p>
      <HandballPitch starters={starters} bench={[]} benchLabel="" />
    </div>
  );
}
