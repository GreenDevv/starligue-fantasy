import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export const metadata = {
  title: "Confidentialité & cookies — Handball Fantasy",
};

// Politique de confidentialité + cookies (une seule page, pratique courante pour un
// petit site) — reflète l'usage RÉEL de l'app (vérifié dans le code au moment de
// l'écriture) : aucun tracking/analytics/publicité, 3 cookies au total, tous
// techniques/fonctionnels (session de connexion + 2 préférences d'affichage).
export default async function ConfidentialitePage() {
  const t = await getTranslations("confidentialite");
  const strong = (chunks: React.ReactNode) => <strong className="text-text">{chunks}</strong>;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 pb-16 pt-8 sm:px-6">
      <div>
        <Link href="/" className="text-xs uppercase tracking-widest text-accent hover:underline">
          {t("backLink")}
        </Link>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-wide text-text">{t("title")}</h1>
      </div>

      <div className="flex flex-col gap-6 text-sm leading-relaxed text-text-muted">
        <section className="pixel-corners border border-border bg-surface p-4">
          <p>{t.rich("intro", { strong })}</p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg uppercase tracking-wide text-text">
            {t("sections.data.title")}
          </h2>
          <p className="mb-2">{t("sections.data.intro")}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t("sections.data.items.email")}</li>
            <li>{t("sections.data.items.password")}</li>
            <li>{t("sections.data.items.name")}</li>
            <li>{t("sections.data.items.favoritePlayer")}</li>
          </ul>
          <p className="mt-2">{t("sections.data.gameDataNote")}</p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg uppercase tracking-wide text-text">
            {t("sections.notDone.title")}
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t("sections.notDone.items.analytics")}</li>
            <li>{t("sections.notDone.items.ads")}</li>
            <li>{t("sections.notDone.items.resale")}</li>
            <li>{t("sections.notDone.items.profiling")}</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg uppercase tracking-wide text-text">
            {t("sections.cookies.title")}
          </h2>
          <p className="mb-2">{t.rich("sections.cookies.intro", { strong })}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-text-muted">
                  <th className="py-1.5 pr-3 font-normal">{t("sections.cookies.table.headers.cookie")}</th>
                  <th className="py-1.5 pr-3 font-normal">{t("sections.cookies.table.headers.role")}</th>
                  <th className="py-1.5 font-normal">{t("sections.cookies.table.headers.duration")}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border/60">
                  <td className="py-1.5 pr-3 font-mono text-text">next-auth.session-token</td>
                  <td className="py-1.5 pr-3">{t("sections.cookies.table.session.role")}</td>
                  <td className="py-1.5">{t("sections.cookies.table.session.duration")}</td>
                </tr>
                <tr className="border-t border-border/60">
                  <td className="py-1.5 pr-3 font-mono text-text">seasonMode</td>
                  <td className="py-1.5 pr-3">{t("sections.cookies.table.seasonMode.role")}</td>
                  <td className="py-1.5">{t("sections.cookies.table.seasonMode.duration")}</td>
                </tr>
                <tr className="border-t border-border/60">
                  <td className="py-1.5 pr-3 font-mono text-text">activeLeagueId</td>
                  <td className="py-1.5 pr-3">{t("sections.cookies.table.activeLeague.role")}</td>
                  <td className="py-1.5">{t("sections.cookies.table.activeLeague.duration")}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg uppercase tracking-wide text-text">
            {t("sections.rights.title")}
          </h2>
          <p>{t("sections.rights.text")}</p>
        </section>
      </div>
    </main>
  );
}
