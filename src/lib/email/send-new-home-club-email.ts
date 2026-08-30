import { buildNewHomeClubEmail, type NewHomeClubEmailParams } from "./new-home-club-email";
import { getResendClient, EMAIL_FROM } from "./resend-client";

// Un destinataire par appel, laisse l'erreur remonter (l'appelant boucle sur les
// admins et attrape par destinataire) — même forme que send-injury-email.ts.
export async function sendNewHomeClubEmail(to: string, params: NewHomeClubEmailParams): Promise<void> {
  const { subject, html } = buildNewHomeClubEmail(params);
  const resend = getResendClient();

  const { error } = await resend.emails.send({ from: EMAIL_FROM, to, subject, html });

  if (error) {
    throw new Error(`Échec d'envoi de l'email « nouveau club » à ${to} : ${error.message}`);
  }
}
