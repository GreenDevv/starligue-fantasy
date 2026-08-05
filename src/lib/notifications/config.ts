// Délai de rappel push avant une deadline — ARCHITECTURE.md §20.2.
// Fonction PURE, pattern src/lib/predictions/odds.ts `parseOddsConfig`.
export function parseNotificationLeadMinutes(raw: Record<string, string>): number {
  return parseInt(raw["NOTIFICATION_LEAD_MINUTES"] ?? "60", 10);
}
