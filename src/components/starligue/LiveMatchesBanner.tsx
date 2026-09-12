import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ClubLogo } from "@/components/ui/ClubLogo";
import type { TodayMatchRow } from "@/lib/matches/get-today-matches";

// Bandeau plein-largeur tout en haut de la home, impossible à manquer, dès qu'un
// match Starligue est actuellement LIVE (ARCHITECTURE.md §28) — distinct du
// carrousel "Jour de match" (TodayMatchCarousel, en haut à droite du hero, tourne
// entre tous les matchs du jour et peut donc afficher un match pas encore
// commencé) et de la bande "journée en cours" (showCurrentGwBand, couvre toute la
// fenêtre deadline→résultats, pas seulement les minutes où ça joue vraiment).
// Seul le championnat a un vrai suivi live (Match.status, voir
// src/lib/ingestion/live-feed.ts) — Warm Up/Coupe de France/EHF ne passent jamais
// à LIVE, `m.id` pointe donc toujours vers un vrai Match.
export async function LiveMatchesBanner({ matches }: { matches: TodayMatchRow[] }) {
  const live = matches.filter((m) => m.status === "LIVE");
  if (live.length === 0) return null;

  const t = await getTranslations("dashboard");

  return (
    <section className="pixel-corners shadow-glow-red flex flex-col gap-2 border border-points-neg/50 bg-points-neg/[0.06] p-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-points-neg opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-points-neg" />
        </span>
        <p className="font-arcade text-xs uppercase tracking-[0.2em] text-points-neg">{t("liveMatchesBanner.title")}</p>
      </div>
      <div className="flex flex-1 flex-wrap gap-x-5 gap-y-1.5">
        {live.map((m) => {
          const label =
            m.livePeriod === "HT" ? t("matchesStrip.halfTime") : typeof m.liveMinute === "number" ? `${m.liveMinute}’` : null;
          return (
            <Link
              key={m.id}
              href={`/matches/${m.id}#match-events`}
              className="flex items-center gap-1.5 text-sm text-text transition-opacity hover:opacity-80"
            >
              <ClubLogo club={m.homeClub} size="xs" />
              <span className="font-arcade tabular-nums">
                {m.homeScore}-{m.awayScore}
              </span>
              <ClubLogo club={m.awayClub} size="xs" />
              {label && <span className="text-xs font-semibold text-points-neg">{label}</span>}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
