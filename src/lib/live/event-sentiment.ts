// Classification "bonne/mauvaise" d'un événement live pour l'affichage (toast,
// couleur) — PAS le scoring fantasy (qui reste la note LNH post-match, indépendante,
// voir scoring_visibility_and_live_toasts). Simple aide visuelle : un but/arrêt se
// lit d'un coup d'œil en vert, une exclusion/perte de balle en rouge.
export type LiveEventSentiment = "positive" | "negative" | "neutral";

const POSITIVE_ICONS = new Set(["goals", "goals_7m", "stops"]);
const NEGATIVE_ICONS = new Set(["yellow_card", "red_card", "two_min", "alert", "missed", "blocked"]);

export function classifyLiveEventSentiment(icon: string): LiveEventSentiment {
  if (POSITIVE_ICONS.has(icon)) return "positive";
  if (NEGATIVE_ICONS.has(icon)) return "negative";
  return "neutral"; // periods_start, periods_finish, timeout…
}
