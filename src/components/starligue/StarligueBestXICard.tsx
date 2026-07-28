import { getTranslations } from "next-intl/server";
import { HandballPitch } from "@/components/pitch/HandballPitch";
import type { TeamOfWeekCardData } from "@/lib/news/get-weekly-cards";

// Lecture seule (comme BestXIWidget) — équipe type de LA SEMAINE, pas de la saison.
export async function StarligueBestXICard({ gameweekNumber, entries }: TeamOfWeekCardData) {
  const t = await getTranslations("dashboard");
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
        {t("bestXICard.subtitle", { number: gameweekNumber })}
      </p>
      <HandballPitch starters={starters} bench={[]} benchLabel="" />
    </div>
  );
}
