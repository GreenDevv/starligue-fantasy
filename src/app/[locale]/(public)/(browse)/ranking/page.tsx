import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { resolveSeasonMode, resolveModeSeason } from "@/lib/team/active-team-context";
import { getFullRanking } from "@/lib/standings/full-ranking";
import { RankingTable } from "@/components/starligue/RankingTable";

// Classement complet "tout-en-un" (classement général + forme + prochain
// adversaire) — page publique dédiée, demande explicite du 13/09 : la home
// n'affiche qu'un extrait (ClubStandingsWidget/StandingsSection).
// ARCHITECTURE.md §34.
export default async function RankingPage() {
  const mode = resolveSeasonMode();
  const [season, t, tCommon] = await Promise.all([
    resolveModeSeason(mode),
    getTranslations("ranking"),
    getTranslations("common"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="text-sm text-text-muted transition-colors hover:text-text">
        ← {tCommon("home")}
      </Link>
      <h1 className="text-2xl text-text">{t("title")}</h1>
      {!season ? (
        <p className="py-8 text-center text-sm text-text-muted">{t("noActiveSeason")}</p>
      ) : (
        <RankingTable {...(await getFullRanking(season.id))} />
      )}
    </div>
  );
}
