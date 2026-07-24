import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DeadlineBanner } from "@/components/DeadlineBanner";
import { NavBar, MobileTabBar } from "@/components/NavBar";
import { SeasonToggle } from "@/components/SeasonToggle";
import { AuthButton } from "@/components/auth/AuthButton";
import { resolveSeasonMode } from "@/lib/team/active-team-context";

export default async function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, activeSeason] = await Promise.all([auth(), prisma.season.findFirst({ where: { isActive: true } })]);
  const seasonMode = resolveSeasonMode();

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
            <SeasonToggle initialMode={seasonMode} />
            <NavBar />
            <AuthButton userName={session?.user?.name} />
          </div>
        </div>
      </nav>
      <DeadlineBanner initialGameweek={bannerGameweek} />
      <main className="mx-auto max-w-2xl px-4 py-6 pb-24 sm:pb-6">{children}</main>
      {/* Rendue hors du <nav> sticky ci-dessus (backdrop-blur-sm y créerait un
          containing block pour ce fixed, le collant sous le header au lieu du
          bas de l'écran) — voir commentaire dans NavBar.tsx. */}
      <MobileTabBar />
    </div>
  );
}
