import type { AppLocale } from "@/i18n/routing";
import { buildPasswordResetEmail } from "./password-reset-email";
import { getResendClient, EMAIL_FROM } from "./resend-client";

export async function sendPasswordResetEmail(
  to: string,
  locale: AppLocale,
  resetUrl: string,
): Promise<void> {
  const { subject, html } = buildPasswordResetEmail(locale, resetUrl);
  const resend = getResendClient();

  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Échec d'envoi de l'email de réinitialisation : ${error.message}`);
  }
}
