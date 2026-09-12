// Délai de rappel push avant une deadline — ARCHITECTURE.md §20.2.
// Fonction PURE, pattern src/lib/predictions/odds.ts `parseOddsConfig`.
export function parseNotificationLeadMinutes(raw: Record<string, string>): number {
  return parseInt(raw["NOTIFICATION_LEAD_MINUTES"] ?? "60", 10);
}

// Délai de rappel Web Push avant le coup d'envoi d'un match — ARCHITECTURE.md §24.
export function parseLiveKickoffReminderMinutes(raw: Record<string, string>): number {
  return parseInt(raw["LIVE_KICKOFF_REMINDER_MINUTES"] ?? "5", 10);
}
