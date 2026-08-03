import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DeadlineBanner } from "@/components/DeadlineBanner";
import { NavBar } from "@/components/NavBar";
import { SeasonToggle } from "@/components/SeasonToggle";
import { AuthButton } from "@/components/auth/AuthButton";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { MobileMenu } from "@/components/MobileMenu";
import { ModeSwitchLink } from "@/components/nav/ModeSwitchLink";
import { resolveSeasonMode } from "@/lib/team/active-team-context";

export default async function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, activeSeason, t] = await Promise.all([
    auth(),
    prisma.season.findFirst({ where: { isActive: true } }),
    getTranslations("nav"),
  ]);
  const seasonMode = resolveSeasonMode();
  // @ts-expect-error — role étendu
  const isAdmin = session?.user?.role === "ADMIN";

  const nextGameweek = activeSeason
    ? await prisma.gameweek.findFirst({
        where: { seasonId: activeSeason.id, deadlineAt: { gt: new Date() } },
        orderBy: { number: "asc" },
        select: { number: true, deadlineAt: true },
      })
    : null;

  const bannerGameweek = nextGameweek
    ? { number: nextGameweek.number, deadlineAt: nextGameweek.deadlineAt.toISOString() }
    : null;

  return (
    <div className="min-h-screen bg-bg">
      <nav className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 sm:max-w-none sm:gap-4 sm:px-6 xl:max-w-6xl">
          <Link
            href="/"
            className="whitespace-nowrap font-display text-base uppercase tracking-widest text-accent"
          >
            Starligue Fantasy
          </Link>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {/* Desktop uniquement : sur mobile, nav + saison + compte + connexion
                sont regroupés dans MobileMenu (menu hamburger plein écran) —
                demande explicite de l'utilisateur plutôt que de garder ces
                contrôles entassés dans le header. LocaleSwitcher reste exclu de
                ce regroupement (demande explicite) : rendu ci-dessous, toujours
                visible quel que soit le breakpoint. */}
            <div className="hidden items-center gap-2 sm:flex sm:gap-3">
              {isAdmin && <SeasonToggle initialMode={seasonMode} />}
              <NavBar />
              {session?.user && (
                <Link
                  href="/account"
                  className="rounded-md px-2.5 py-1.5 text-sm text-text-muted transition-colors hover:text-text"
                >
                  {t("account")}
                </Link>
              )}
              <AuthButton userName={session?.user?.name} />
            </div>
            <ModeSwitchLink href="/" tone="starligue">
              {t("starligue")}
            </ModeSwitchLink>
            <LocaleSwitcher />
            <MobileMenu userName={session?.user?.name} isAdmin={isAdmin} seasonMode={seasonMode} />
          </div>
        </div>
      </nav>
      <DeadlineBanner initialGameweek={bannerGameweek} />
      <main className="mx-auto max-w-2xl px-4 py-6 pb-6">{children}</main>
    </div>
  );
}
