// Script ponctuel — informe les 2 utilisateurs qui avaient Théophile CAUSSE
// (Cesson Rennes MHB) dans leur effectif Fantasy live 2026/27 que ce joueur a
// été retiré de la base (n'existe pas dans l'effectif officiel du club, voir
// mémoire "Reconciliation lnh.fr vs DB" du 2026-08-27) et les invite à
// compléter leur effectif désormais à 13/14 joueurs.
//
// Contrairement à notify-player-injured.ts, on ne peut pas requêter
// FantasySquadPlayer pour retrouver les concernés : la suppression du Player
// a cascadé sur ces lignes. Les 2 destinataires ont donc été identifiés
// manuellement avant la suppression (voir session du 2026-08-27) et sont codés
// en dur ci-dessous, à usage unique.
//
// La saison live n'a pas encore commencé (1ère deadline : 4 septembre 2026,
// voir Gameweek.deadlineAt) — hasLiveSeasonStarted() renvoie donc false, ce
// qui autorise encore un rebuild complet et libre via /team/build (voir
// src/lib/squad/season-lock.ts), sans passer par le marché des transferts.
// C'est donc ce lien qui est utilisé en CTA, pas /team/transfers comme pour
// l'email de blessure.
import { getResendClient, EMAIL_FROM } from "../src/lib/email/resend-client";
import { renderBaseEmail } from "../src/lib/email/base-template";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://starliguefantasy.fr";

const RECIPIENTS = [
  {
    email: "adrienmallard@gmail.com",
    teamName: "Équipe de Drallam",
    leagueName: "Gironde",
    leagueId: "cms4s8y3h00bn9052by7v12c8",
  },
  {
    email: "alexroux58@gmail.com",
    teamName: "Équipe de AlexRoux",
    leagueName: "La colooooooc",
    leagueId: "cms55bmx50002j90mvylmoinx",
  },
];

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildEmail(teamName: string, leagueName: string, buildUrl: string) {
  const subject = "Un joueur a été retiré de la base — complète ton effectif";
  const heading = "Théophile CAUSSE a été retiré de notre base de données";
  const intro =
    "Après vérification auprès de la LNH, Théophile CAUSSE (Demi Centre, Cesson Rennes MHB) ne fait pas partie de l'effectif officiel du club pour la saison 2026/27 — c'était une erreur dans notre base, que nous venons de corriger. Il a été retiré automatiquement de ton effectif :";
  const teamLine = `<strong>${escapeHtml(teamName)}</strong> (ligue ${escapeHtml(leagueName)}) — ton effectif compte désormais 13 joueurs sur 14.`;
  const html = renderBaseEmail({
    preheader: intro,
    heading,
    bodyParagraphs: [
      intro,
      teamLine,
      "La saison n'a pas encore commencé (coup d'envoi le 4 septembre) : tu peux dès maintenant reconstruire librement ton effectif à 14 joueurs pour le compléter, sans passer par le marché des transferts ni utiliser de joker.",
    ],
    cta: { label: "Compléter mon effectif", url: buildUrl },
    footNote: "Désolé pour la gêne occasionnée — réponds à cet email si tu as une question.",
  });
  return { subject, html };
}

async function main() {
  const resend = getResendClient();
  for (const r of RECIPIENTS) {
    const buildUrl = `${SITE_URL}/fr/team/build?league=${r.leagueId}`;
    const { subject, html } = buildEmail(r.teamName, r.leagueName, buildUrl);
    const { error } = await resend.emails.send({ from: EMAIL_FROM, to: r.email, subject, html });
    if (error) {
      console.error(`[causse-removal-email] échec pour ${r.email} :`, error.message);
    } else {
      console.log(`[causse-removal-email] envoyé à ${r.email}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
