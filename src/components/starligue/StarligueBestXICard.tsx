import { getTranslations } from "next-intl/server";
import { HandballPitch } from "@/components/pitch/HandballPitch";
import { GameweekDropdown } from "@/components/dashboard/GameweekDropdown";
import type { TeamOfWeekCardData } from "@/lib/news/get-weekly-cards";

// Lecture seule (comme BestXIWidget). `nav` (13/09, optionnel) ajoute le dropdown
// de la home pour naviguer entre les journées ET une option "Saison" — même
// pattern query-param que le strip "Résultats" (GameweekDropdown). Sans `nav`
// (usage sur /starligue/[id], article figé), reste un simple sous-titre statique.
export async function StarligueBestXICard({
  gameweekNumber,
  entries,
  isSeason = false,
  nav,
}: TeamOfWeekCardData & {
  isSeason?: boolean;
  nav?: { total: number; availableGameweeks: number[]; hrefBase: string; queryParam?: string };
}) {
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
  const subtitle = isSeason ? t("bestXICard.subtitleSeason") : t("bestXICard.subtitle", { number: gameweekNumber });

  return (
    <div className="pixel-corners border border-border bg-surface p-3">
      <div className="mb-2">
        {nav ? (
          <GameweekDropdown
            current={isSeason ? "season" : gameweekNumber}
            total={nav.total}
            availableGameweeks={nav.availableGameweeks}
            hrefBase={nav.hrefBase}
            queryParam={nav.queryParam ?? "teamGw"}
            label={subtitle}
            extraOption={{ value: "season", label: t("bestXICard.subtitleSeason") }}
          />
        ) : (
          <p className="text-[10px] uppercase tracking-widest text-text-muted">{subtitle}</p>
        )}
      </div>
      <HandballPitch starters={starters} bench={[]} benchLabel="" />
    </div>
  );
}
