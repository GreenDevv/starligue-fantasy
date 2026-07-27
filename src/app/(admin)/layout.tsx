import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AuthButton } from "@/components/auth/AuthButton";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  // @ts-expect-error — role étendu
  if (!session || session.user?.role !== "ADMIN") {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-bg">
      <nav className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
          <span className="font-display text-base uppercase tracking-widest text-accent">
            Starligue Fantasy
          </span>
          <span className="rounded-full bg-points-neg/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-points-neg">
            Admin
          </span>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <a href="/admin/players" className="text-text-muted transition-colors hover:text-text">
              Joueurs
            </a>
            <a href="/admin/clubs" className="text-text-muted transition-colors hover:text-text">
              Clubs
            </a>
            <a href="/admin/transfer-windows" className="text-text-muted transition-colors hover:text-text">
              Transferts
            </a>
            <a href="/admin/news" className="text-text-muted transition-colors hover:text-text">
              Actus
            </a>
            <a href="/admin" className="text-text-muted transition-colors hover:text-text">
              Dashboard
            </a>
            <a href="/" className="text-text-muted transition-colors hover:text-text">
              ← Jeu
            </a>
            <AuthButton userName={session.user?.name} />
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
    </div>
  );
}
