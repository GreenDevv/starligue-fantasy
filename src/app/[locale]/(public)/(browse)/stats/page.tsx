import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { resolveSeasonMode, resolveModeSeason } from "@/lib/team/active-team-context";
import { StatsExplorerView } from "@/components/stats/StatsExplorerView";

// Page publique (mode Starligue) : leaders par ligne de stat (buts, passes,
// arrêts, etc.), choisis via une checklist (StatsExplorerView) plutôt
// qu'affichés tous en même temps — même registre de lignes que le dashboard
// Fantasy (StatLeadersPanel) mais UI dédiée, voir ce composant.
export default async function StatsPage() {
  const mode = resolveSeasonMode();
  const [season, t, tCommon] = await Promise.all([
    resolveModeSeason(mode),
    getTranslations("stats"),
    getTranslations("common"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="text-sm text-text-muted hover:text-text transition-colors">
        ← {tCommon("home")}
      </Link>
      <h1 className="text-2xl text-text">{t("title")}</h1>
      {!season ? (
        <p className="py-8 text-center text-sm text-text-muted">{t("noActiveSeason")}</p>
      ) : (
        <StatsExplorerView mode={mode} seasonId={season.id} />
      )}
    </div>
  );
}
