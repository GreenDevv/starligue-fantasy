import Link from "next/link";

export const metadata = {
  title: "Confidentialité & cookies — Starligue Fantasy",
};

// Politique de confidentialité + cookies (une seule page, pratique courante pour un
// petit site) — reflète l'usage RÉEL de l'app (vérifié dans le code au moment de
// l'écriture) : aucun tracking/analytics/publicité, 3 cookies au total, tous
// techniques/fonctionnels (session de connexion + 2 préférences d'affichage).
export default function ConfidentialitePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 pb-16 pt-8 sm:px-6">
      <div>
        <Link href="/" className="text-xs uppercase tracking-widest text-accent hover:underline">
          ← Retour à l&apos;accueil
        </Link>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-wide text-text">
          Confidentialité &amp; cookies
        </h1>
      </div>

      <div className="flex flex-col gap-6 text-sm leading-relaxed text-text-muted">
        <section className="pixel-corners border border-border bg-surface p-4">
          <p>
            Starligue Fantasy est un <strong className="text-text">projet personnel</strong>, sans rapport
            officiel avec la LNH ou la Daikin StarLigue, développé et hébergé à titre non commercial. Cette
            page explique simplement quelles données sont collectées, pourquoi, et quels cookies sont utilisés.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg uppercase tracking-wide text-text">Données collectées</h2>
          <p className="mb-2">À la création d&apos;un compte, sont enregistrés :</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>ton adresse email (identifiant de connexion, jamais partagée)</li>
            <li>ton mot de passe, jamais stocké en clair (haché avec bcrypt)</li>
            <li>ton prénom/pseudo affiché dans l&apos;app</li>
            <li>ton joueur préféré, si tu choisis d&apos;en indiquer un (facultatif)</li>
          </ul>
          <p className="mt-2">
            En jouant, tu génères aussi des données de jeu : effectifs, alignements, ligues, points, historique
            — nécessaires au fonctionnement du jeu lui-même, jamais utilisées à d&apos;autres fins.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg uppercase tracking-wide text-text">Ce qui n&apos;est PAS fait</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>aucun outil d&apos;analyse d&apos;audience (Google Analytics ou équivalent)</li>
            <li>aucun cookie ou pixel publicitaire</li>
            <li>aucune revente ni partage de données à des tiers</li>
            <li>aucun profilage</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg uppercase tracking-wide text-text">Cookies utilisés</h2>
          <p className="mb-2">
            Ce site utilise uniquement des cookies <strong className="text-text">techniques/fonctionnels</strong>,
            strictement nécessaires à son fonctionnement — aucun consentement n&apos;est requis pour ce type de
            cookie (recommandation CNIL), et aucun autre cookie n&apos;est déposé.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-text-muted">
                  <th className="py-1.5 pr-3 font-normal">Cookie</th>
                  <th className="py-1.5 pr-3 font-normal">Rôle</th>
                  <th className="py-1.5 font-normal">Durée</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border/60">
                  <td className="py-1.5 pr-3 font-mono text-text">next-auth.session-token</td>
                  <td className="py-1.5 pr-3">Te garde connecté(e)</td>
                  <td className="py-1.5">30 jours ou déconnexion</td>
                </tr>
                <tr className="border-t border-border/60">
                  <td className="py-1.5 pr-3 font-mono text-text">seasonMode</td>
                  <td className="py-1.5 pr-3">Mémorise le mode saison en cours/simulation choisi</td>
                  <td className="py-1.5">Persistant</td>
                </tr>
                <tr className="border-t border-border/60">
                  <td className="py-1.5 pr-3 font-mono text-text">activeLeagueId</td>
                  <td className="py-1.5 pr-3">Mémorise ta ligue active si tu en as plusieurs</td>
                  <td className="py-1.5">Persistant</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg uppercase tracking-wide text-text">Tes droits</h2>
          <p>
            Tu peux à tout moment demander l&apos;accès, la correction ou la suppression de tes données. Comme il
            s&apos;agit d&apos;un projet personnel sans support dédié, la façon la plus simple reste de contacter
            directement la personne qui te l&apos;a fait découvrir.
          </p>
        </section>
      </div>
    </main>
  );
}
