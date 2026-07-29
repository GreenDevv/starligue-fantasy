// Contenu localisé de l'email de réinitialisation de mot de passe —
// ARCHITECTURE.md §6.1. Imports statiques (comme src/i18n/request.ts) : le
// build standalone Railway trace les dépendances par analyse statique, un
// chemin construit dynamiquement ne serait pas embarqué dans le bundle.
import type { AppLocale } from "@/i18n/routing";
import { renderBaseEmail } from "./base-template";
import frAuth from "../../../messages/fr/auth.json";
import enAuth from "../../../messages/en/auth.json";
import esAuth from "../../../messages/es/auth.json";
import caAuth from "../../../messages/ca/auth.json";
import deAuth from "../../../messages/de/auth.json";
import ptAuth from "../../../messages/pt/auth.json";
import daAuth from "../../../messages/da/auth.json";
import plAuth from "../../../messages/pl/auth.json";

const AUTH_MESSAGES: Record<AppLocale, typeof frAuth> = {
  fr: frAuth,
  en: enAuth,
  es: esAuth,
  ca: caAuth,
  de: deAuth,
  pt: ptAuth,
  da: daAuth,
  pl: plAuth,
};

export interface PasswordResetEmailContent {
  subject: string;
  html: string;
}

export function buildPasswordResetEmail(locale: AppLocale, resetUrl: string): PasswordResetEmailContent {
  const t = AUTH_MESSAGES[locale].forgotPassword.email;

  const html = renderBaseEmail({
    preheader: t.body,
    heading: t.heading,
    bodyParagraphs: [t.body],
    cta: { label: t.cta, url: resetUrl },
    footNote: t.ignoreLine,
  });

  return { subject: t.subject, html };
}
