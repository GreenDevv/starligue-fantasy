// Formatage + paliers du compte à rebours de deadline — partagé par
// <DeadlineBanner> (bandeau global) et <GameweekPanel> (panneau /team).

export type DeadlineTier = "calm" | "amber" | "red";

export function deadlineTier(remainingMs: number): DeadlineTier {
  if (remainingMs < 2 * 3_600_000) return "red";
  if (remainingMs < 24 * 3_600_000) return "amber";
  return "calm";
}

export function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return "0:00:00";
  const totalSeconds = Math.floor(remainingMs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h >= 48) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return `${d}j ${rh}h${String(m).padStart(2, "0")}`;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
