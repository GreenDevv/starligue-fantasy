import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export const metadata = {
  title: "Support — Starligue Fantasy",
};

const SUPPORT_EMAIL = "contact@starliguefantasy.fr";

// Page de support requise par l'App Store (guideline 1.5) : l'URL de support
// déclarée dans App Store Connect doit pointer vers une vraie page d'aide, pas
// juste la home. Contact direct (pas de formulaire/bot) + FAQ courte reprenant
// les points qui reviennent le plus (mot de passe, suppression de compte,
// signalement) — voir /confidentialite pour la politique de données.
export default async function SupportPage() {
  const t = await getTranslations("support");
  const faqKeys = ["password", "deleteAccount", "report", "bug"] as const;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 pb-16 pt-8 sm:px-6">
      <div>
        <Link href="/" className="text-xs uppercase tracking-widest text-accent hover:underline">
          {t("backLink")}
        </Link>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-wide text-text">{t("title")}</h1>
      </div>

      <p className="text-sm leading-relaxed text-text-muted">{t("intro")}</p>

      <section className="pixel-corners border border-border bg-surface p-4">
        <h2 className="mb-2 font-display text-lg uppercase tracking-wide text-text">{t("contact.title")}</h2>
        <p className="mb-2 text-sm text-text-muted">{t("contact.text")}</p>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-lg font-semibold text-accent hover:underline">
          {SUPPORT_EMAIL}
        </a>
        <p className="mt-2 text-xs text-text-muted">{t("contact.responseTime")}</p>
      </section>

      <section className="flex flex-col gap-4 text-sm leading-relaxed text-text-muted">
        <h2 className="font-display text-lg uppercase tracking-wide text-text">{t("faq.title")}</h2>
        {faqKeys.map((key) => (
          <div key={key}>
            <h3 className="mb-1 font-semibold text-text">{t(`faq.items.${key}.q`)}</h3>
            <p>{t(`faq.items.${key}.a`)}</p>
          </div>
        ))}
      </section>

      <Link href="/confidentialite" className="text-xs text-accent hover:underline">
        {t("privacyLink")}
      </Link>
    </main>
  );
}
