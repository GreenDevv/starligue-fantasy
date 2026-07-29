import { Resend } from "resend";

// Instancié à l'usage (pas au chargement du module) : évite un crash au build
// si RESEND_API_KEY n'est pas encore renseignée (Railway déploie avant que
// toutes les variables d'env optionnelles soient posées).
export function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY manquante — impossible d'envoyer un email");
  }
  return new Resend(apiKey);
}

export const EMAIL_FROM = process.env.EMAIL_FROM ?? "contact@starliguefantasy.fr";
