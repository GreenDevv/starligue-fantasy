import { Link, redirect } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { AuthButton } from "@/components/auth/AuthButton";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") {
    redirect({ href: "/login", locale: params.locale });
    // next-intl's redirect() n'est pas toujours inféré comme `never` par TS ici
    // (générique via createNavigation) — ce `return` explicite garantit le
    // rétrécissement de type de `session` (non-null) pour le reste du composant.
    return;
  }

  const t = await getTranslations("admin");

  return (
    <div className="min-h-screen bg-bg">
      <nav className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
          <span className="font-display text-base uppercase tracking-widest text-accent">
            Starligue Fantasy
          </span>
          <span className="rounded-full bg-points-neg/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-points-neg">
            {t("nav.badge")}
          </span>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <Link href="/admin/players" className="text-text-muted transition-colors hover:text-text">
              {t("nav.players")}
            </Link>
            <Link href="/admin/clubs" className="text-text-muted transition-colors hover:text-text">
              {t("nav.clubs")}
            </Link>
            <Link href="/admin/transfer-windows" className="text-text-muted transition-colors hover:text-text">
              {t("nav.transfers")}
            </Link>
            <Link href="/admin/news" className="text-text-muted transition-colors hover:text-text">
              {t("nav.news")}
            </Link>
            <Link href="/admin" className="text-text-muted transition-colors hover:text-text">
              {t("nav.dashboard")}
            </Link>
            <Link href="/" className="text-text-muted transition-colors hover:text-text">
              {t("nav.backToGame")}
            </Link>
            <LocaleSwitcher />
            <AuthButton userName={session.user?.name} />
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
    </div>
  );
}
