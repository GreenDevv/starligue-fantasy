// Reproduit le <main> que fournissait (game)/layout.tsx pour ces pages avant leur
// passage en mode Starligue (public) — clubs/matches/players n'ont pas de
// conteneur propre. Ajoute un retour PERSISTANT vers l'accueil Starligue : les
// pages profondes (club, match, confrontation) n'avaient que des retours en
// chaîne vers la page parente, jamais un accès direct à l'accueil.
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function BrowseLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("common");
  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-6">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted transition-colors hover:text-accent"
      >
        ← {t("backToStarligueHome")}
      </Link>
      {children}
    </main>
  );
}
