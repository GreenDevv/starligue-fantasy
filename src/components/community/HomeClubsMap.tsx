import { getTranslations } from "next-intl/server";
import {
  makeFranceProjector,
  METRO_FRANCE_RING,
  CORSICA_RING,
} from "@/lib/geo/france-map";
import { countryFlag } from "@/lib/geo/countries";
import { abroadLabel, type HomeClubsAggregate } from "@/lib/community/home-clubs";

const W = 320;
const H = 320;

// Rayon d'un point de département : racine du nombre de managers (aire ∝ count),
// borné pour rester lisible même à fort effectif.
function dotRadius(count: number): number {
  return Math.min(3 + Math.sqrt(count) * 2.4, 16);
}

export async function HomeClubsMap({
  aggregate,
  locale,
}: {
  aggregate: HomeClubsAggregate;
  locale: string;
}) {
  const t = await getTranslations("community");
  const { totals, metropolitan, abroad, unlocated } = aggregate;

  if (totals.members === 0) return null;

  const proj = makeFranceProjector(W, H);
  const outline = `${proj.ringPath(METRO_FRANCE_RING)} ${proj.ringPath(CORSICA_RING)}`;

  const hasSidePanel = abroad.length > 0 || unlocated > 0;

  return (
    <section className="pixel-corners border border-border bg-surface p-4">
      <div
        className={
          hasSidePanel
            ? "flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-center"
            : "mx-auto flex max-w-sm flex-col items-center text-center"
        }
      >
        <div className={hasSidePanel ? "sm:order-2 sm:max-w-xs" : ""}>
          <h2 className="font-display text-lg uppercase tracking-wide text-text">{t("homeMap.title")}</h2>
          <p className="mt-1 text-sm text-text-muted">
            {t("homeMap.summary", {
              members: totals.members,
              clubs: totals.clubs,
              departments: totals.departments,
            })}
          </p>

          {hasSidePanel && (
            <div className="mt-4 text-left">
              <h3 className="text-xs uppercase tracking-widest text-text-muted">{t("homeMap.alsoRepresented")}</h3>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-text">
                {abroad.map((g) => (
                  <li key={g.key} className="flex items-center justify-between gap-3">
                    <span className="truncate">
                      {g.key !== "OUTRE_MER" && `${countryFlag(g.key)} `}
                      {abroadLabel(g.key, locale, t("homeMap.overseas"))}
                    </span>
                    <span className="shrink-0 tabular-nums text-text-muted">{g.count}</span>
                  </li>
                ))}
                {unlocated > 0 && (
                  <li className="flex items-center justify-between gap-3 text-text-muted">
                    <span>{t("homeMap.unlocated")}</span>
                    <span className="shrink-0 tabular-nums">{unlocated}</span>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className={`w-full max-w-[300px] shrink-0 ${hasSidePanel ? "sm:order-1" : "mt-3"}`}
          role="img"
          aria-label={t("homeMap.title")}
        >
          <path d={outline} className="fill-bg stroke-border" strokeWidth={1} />
          {metropolitan.map((d) => {
            const { x, y } = proj.project(d.lon, d.lat);
            return (
              <circle
                key={d.dept}
                cx={x}
                cy={y}
                r={dotRadius(d.count)}
                className="fill-accent/70 stroke-accent"
                strokeWidth={1}
              >
                <title>{t("homeMap.dotTitle", { count: d.count })}</title>
              </circle>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
