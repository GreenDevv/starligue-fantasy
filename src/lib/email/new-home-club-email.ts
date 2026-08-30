// Contenu de l'email envoyé aux ADMIN quand un membre saisit librement un club
// d'origine hors annuaire (HandballClub source=MANUAL, verified=false) — leur
// demande de le valider ou le rejeter. Déclenché best-effort depuis
// src/lib/notifications/notify-new-home-club.ts.
// Français uniquement (comme l'email de blessure — pas de langue par admin).
import { renderBaseEmail } from "./base-template";
import { countryName, countryFlag } from "@/lib/geo/countries";

export interface NewHomeClubEmailParams {
  clubName: string;
  city: string | null;
  country: string; // ISO 3166-1 alpha-2
  memberName: string;
  verifyUrl: string; // lien one-click « Valider » (jeton signé)
  rejectUrl: string; // lien one-click « Rejeter » (jeton signé)
  adminUrl: string; // lien vers /admin/handball-clubs
}

export interface NewHomeClubEmailContent {
  subject: string;
  html: string;
}

// clubName / memberName / city viennent d'une saisie utilisateur — jamais
// interpolés bruts dans le HTML (même précaution que injury-email.ts).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Deux boutons côte à côte (le gabarit de base n'a qu'un CTA) — table pour tenir
// dans les clients mail. Vert = valider, ambre = rejeter.
function actionsBlock(verifyUrl: string, rejectUrl: string): string {
  const btn = (url: string, label: string, bg: string, fg: string) =>
    `<a href="${url}" style="display:inline-block;background-color:${bg};color:${fg};font-weight:700;font-size:15px;text-decoration:none;padding:14px 26px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">${label}</a>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:12px;">${btn(verifyUrl, "✅ Valider", "#2DD4BF", "#0E1116")}</td>
    <td>${btn(rejectUrl, "🗑 Rejeter", "#F59E0B", "#0E1116")}</td>
  </tr></table>`;
}

export function buildNewHomeClubEmail(params: NewHomeClubEmailParams): NewHomeClubEmailContent {
  const club = escapeHtml(params.clubName);
  const member = escapeHtml(params.memberName);
  const place = [params.city ? escapeHtml(params.city) : null, `${countryFlag(params.country)} ${countryName(params.country, "fr")}`]
    .filter(Boolean)
    .join(" · ");

  const subject = `Nouveau club à valider : ${params.clubName}`;

  const html = renderBaseEmail({
    preheader: `${member} a ajouté « ${club} » — valide ou rejette en un clic.`,
    heading: "Un club d'origine à modérer",
    bodyParagraphs: [
      `<strong>${member}</strong> vient de renseigner un club qui n'est pas dans l'annuaire FFHandball :`,
      `<strong>${club}</strong><br /><span style="color:#94A3B8;">${place}</span>`,
      `<strong>Valider</strong> → le club apparaît sur la carte des managers et le classement des clubs.<br /><strong>Rejeter</strong> → il est supprimé et ${member} pourra en saisir un autre.`,
      actionsBlock(params.verifyUrl, params.rejectUrl),
      `<span style="font-size:13px;color:#94A3B8;">Ou <a href="${params.adminUrl}" style="color:#2DD4BF;">ouvre la modération</a> pour fusionner avec un club de l'annuaire. Ces liens expirent dans 7 jours.</span>`,
    ],
    footNote: "Tu reçois cet email parce que tu es administrateur de Starligue Fantasy.",
  });

  return { subject, html };
}
