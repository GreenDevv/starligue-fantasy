// Résolution code -> message traduit pour les erreurs API `{ error: { code, message } }`.
// Les routes API renvoient toujours un `code` stable mais un `message` FR en dur
// (non traduit, non affiché) : la traduction se fait ici côté client à partir du
// code.
//
// `t` doit être un traducteur SANS namespace (`useTranslations()` sans argument),
// pour pouvoir lire à la fois la clé propre à la zone (`<scope>.errors.<CODE>`,
// définie dans messages/<locale>/<scope>.json) et le repli partagé
// (`errors.common.<CODE>`/`errors.common.generic`, déjà fourni dans
// messages/<locale>/errors.json — namespace en lecture seule, ne jamais y ajouter
// de clé propre à une zone pour éviter les conflits entre zones).
interface RootT {
  (key: string, values?: Record<string, string | number>): string;
  has(key: string): boolean;
}

export function resolveApiError(t: RootT, scope: string, code?: string | null): string {
  const candidates = code ? [`${scope}.errors.${code}`, `errors.common.${code}`] : [];
  for (const key of candidates) {
    if (t.has(key)) return t(key);
  }
  return t("errors.common.generic");
}
