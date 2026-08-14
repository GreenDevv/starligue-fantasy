// Gabarit HTML partagé pour tous les emails transactionnels (reset de mot de
// passe, et futurs : bienvenue, invitation de ligue...) — reprend la palette
// de marque (ARCHITECTURE.md §8.1, mêmes couleurs que le hero Instagram
// généré par src/app/api/og/stat-leaders/route.tsx) pour que chaque
// communication ait la même identité visuelle que le reste du site.
//
// Polices système uniquement (pas de @font-face Barlow Condensed/Inter) : la
// plupart des clients mail bloquent ou ignorent les polices custom, le rendu
// serait incohérent d'une boîte à l'autre. L'effet "display" est simulé par
// majuscules + tracking sur le bandeau de marque, qui passe partout.
const COLORS = {
  bg: "#0E1116",
  surface: "#171C24",
  border: "#262D38",
  accent: "#2DD4BF",
  accentSecondary: "#F59E0B",
  text: "#F1F5F9",
  textMuted: "#94A3B8",
};

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://starliguefantasy.fr";

export interface EmailCta {
  label: string;
  url: string;
}

export interface BaseEmailOptions {
  /** Texte caché affiché en aperçu par le client mail (avant ouverture) */
  preheader: string;
  heading: string;
  /** Un paragraphe par entrée, rendu tel quel (peut contenir du HTML simple) */
  bodyParagraphs: string[];
  cta?: EmailCta;
  /** Note secondaire sous le CTA (ex : "si tu n'es pas à l'origine de cette demande...") */
  footNote?: string;
}

export function renderBaseEmail({ preheader, heading, bodyParagraphs, cta, footNote }: BaseEmailOptions): string {
  const bodyHtml = bodyParagraphs
    .map(
      (p) =>
        `<tr><td style="color:${COLORS.textMuted};font-size:15px;line-height:1.6;padding-bottom:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">${p}</td></tr>`,
    )
    .join("\n");

  const ctaHtml = cta
    ? `<tr>
        <td style="padding-bottom:24px;">
          <a href="${cta.url}" style="display:inline-block;background-color:${COLORS.accent};color:${COLORS.bg};font-weight:700;font-size:15px;text-decoration:none;padding:14px 28px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
            ${cta.label}
          </a>
        </td>
      </tr>`
    : "";

  const footNoteHtml = footNote
    ? `<tr><td style="color:${COLORS.textMuted};font-size:13px;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">${footNote}</td></tr>`
    : "";

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
  </head>
  <body style="margin:0;padding:0;background-color:${COLORS.bg};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.bg};padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:600px;">
            <tr>
              <td align="center" style="padding-bottom:28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
                <span style="font-size:13px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:${COLORS.accentSecondary};">Fantasy Handball</span>
                <div style="font-size:22px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${COLORS.text};margin-top:6px;">
                  Starligue <span style="color:${COLORS.accent};">Fantasy</span>
                </div>
              </td>
            </tr>
            <tr>
              <td style="background-color:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:16px;padding:32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="color:${COLORS.text};font-size:22px;font-weight:700;padding-bottom:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
                      ${heading}
                    </td>
                  </tr>
                  ${bodyHtml}
                  ${ctaHtml}
                  ${footNoteHtml}
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
                <a href="${SITE_URL}" style="color:${COLORS.textMuted};font-size:12px;text-decoration:none;">Handball Fantasy — ${SITE_URL.replace(/^https?:\/\//, "")}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
