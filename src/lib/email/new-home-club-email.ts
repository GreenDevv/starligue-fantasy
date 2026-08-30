// Contenu de l'email envoyé aux ADMIN quand un membre saisit librement un club
// d'origine hors annuaire (HandballClub source=MANUAL, verified=false) — leur
// demande de le valider ou le rejeter (/admin/handball-clubs). Déclenché
// best-effort depuis src/lib/notifications/notify-new-home-club.ts.
// Français uniquement (comme l'email de blessure — pas de langue par admin).
import { renderBaseEmail } from "./base-template";
import { countryName, countryFlag } from "@/lib/geo/countries";

export interface NewHomeClubEmailParams {
  clubName: string;
  city: string | null;
  country: string; // ISO 3166-1 alpha-2
  memberName: string;
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

export function buildNewHomeClubEmail(params: NewHomeClubEmailParams): NewHomeClubEmailContent {
  const club = escapeHtml(params.clubName);
  const member = escapeHtml(params.memberName);
  const place = [params.city ? escapeHtml(params.city) : null, `${countryFlag(params.country)} ${countryName(params.country, "fr")}`]
    .filter(Boolean)
    .join(" · ");

  const subject = `Nouveau club à valider : ${params.clubName}`;

  const html = renderBaseEmail({
    preheader: `${member} a ajouté « ${club} » — à valider ou rejeter.`,
    heading: "Un club d'origine à modérer",
    bodyParagraphs: [
      `<strong>${member}</strong> vient de renseigner un club qui n'est pas dans l'annuaire FFHandball :`,
      `<strong>${club}</strong><br /><span style="color:#94A3B8;">${place}</span>`,
      `Valide-le s'il est réel (il apparaîtra alors sur la carte et le classement des clubs), ou rejette-le — dans ce cas ${member} se retrouvera sans club et pourra en saisir un autre.`,
    ],
    cta: { label: "Modérer les clubs", url: params.adminUrl },
    footNote: "Tu reçois cet email parce que tu es administrateur de Starligue Fantasy.",
  });

  return { subject, html };
}
