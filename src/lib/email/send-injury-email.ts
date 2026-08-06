import { buildInjuryEmail, type InjuryEmailParams } from "./injury-email";
import { getResendClient, EMAIL_FROM } from "./resend-client";

// Même forme que send-password-reset-email.ts : un seul destinataire par appel,
// laisse l'erreur remonter (l'appelant, notify-player-injured.ts, l'attrape par
// destinataire pour qu'un échec isolé n'empêche pas de notifier les autres).
export async function sendInjuryEmail(to: string, params: InjuryEmailParams): Promise<void> {
  const { subject, html } = buildInjuryEmail(params);
  const resend = getResendClient();

  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Échec d'envoi de l'email de blessure à ${to} : ${error.message}`);
  }
}
