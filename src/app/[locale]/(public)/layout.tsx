import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PublicNavBar } from "@/components/PublicNavBar";
import { PublicMobileMenu } from "@/components/PublicMobileMenu";
import { ModeSwitchLink } from "@/components/nav/ModeSwitchLink";
import { AuthButton } from "@/components/auth/AuthButton";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { SeasonToggle } from "@/components/SeasonToggle";
import { resolveSeasonMode } from "@/lib/team/active-team-context";

// Layout du mode Starligue (public, aucune connexion requise) : /, /matches,
// /clubs/[id], /players/[id] (regroupées sous (browse), voir son layout.tsx
// pour le <main> qu'elles héritaient de l'ancien GameLayout), /login,
// /register, /forgot-password, /reset-password, /confidentialite,
// /starligue/[id]. Ne fournit ni <main> ni contrainte de largeur : chaque
// page/sous-groupe garde son propre conteneur (home = max-w-6xl, (browse) =
// max-w-2xl, pages d'auth = leur propre mise en page centrée). Pas de
// DeadlineBanner ici, spécifique au jeu Fantasy (voir (game)/layout.tsx).
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [session, t] = await Promise.all([auth(), getTranslations("nav")]);
  const fantasyHref = session?.user ? "/dashboard" : "/login";
  // @ts-expect-error — role étendu
  const isAdmin = session?.user?.role === "ADMIN";
  const seasonMode = resolveSeasonMode();

  return (
    <div className="min-h-screen bg-bg">
      <nav className="sticky top-0 z-10 border-b border-border bg-surface/90 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 sm:max-w-none sm:gap-4 sm:px-6 xl:max-w-6xl">
          <Link
            href="/"
            className="whitespace-nowrap font-display text-base uppercase tracking-widest text-accent"
          >
            Handball Fantasy
          </Link>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {/* Desktop uniquement : sur mobile, nav + connexion sont regroupés
                dans PublicMobileMenu, même convention que GameLayout.
                LocaleSwitcher reste exclu de ce regroupement (demande
                explicite historique côté mode Fantasy, reconduite ici). */}
            <div className="hidden items-center gap-2 sm:flex sm:gap-3">
              {isAdmin && <SeasonToggle initialMode={seasonMode} />}
              <PublicNavBar />
              {/* Pas de lien "Connexion" : le bouton "Fantasy" ci-dessous sert déjà
                  de point d'entrée pour se connecter si besoin. AuthButton n'est
                  donc rendu que pour offrir la déconnexion à un utilisateur déjà
                  connecté. */}
              {session?.user && <AuthButton userName={session.user.name} />}
            </div>
            <ModeSwitchLink href={fantasyHref} tone="fantasy">
              {t("fantasy")}
            </ModeSwitchLink>
            <LocaleSwitcher />
            <PublicMobileMenu
              userName={session?.user?.name}
              fantasyHref={fantasyHref}
              isAdmin={isAdmin}
              seasonMode={seasonMode}
            />
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
