import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getActiveClubs } from "@/lib/clubs/get-active-clubs";
import { resolveSeasonMode, resolveModeSeason } from "@/lib/team/active-team-context";
import { PlayersListView } from "@/components/players/PlayersListView";

// Liste publique (mode Starligue) de tous les joueurs — filtrable par poste/
// club, recherche par nom, sans aucune valeur/prix fantasy (voir
// PlayersListView pour le détail). Résout la saison affichée de la même façon
// que /api/players (resolveModeSeason, cookie seasonMode) pour que le filtre
// club reste cohérent avec les joueurs effectivement retournés par l'API.
export default async function PlayersPage() {
  const mode = resolveSeasonMode();
  const [season, tCommon] = await Promise.all([resolveModeSeason(mode), getTranslations("common")]);
  const clubs = season ? await getActiveClubs(season.id) : [];

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="text-sm text-text-muted hover:text-text transition-colors">
        ← {tCommon("home")}
      </Link>
      <PlayersListView mode={mode} clubs={clubs} />
    </div>
  );
}
