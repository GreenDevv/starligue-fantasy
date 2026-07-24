import type { Position } from "@/lib/squad/validation";

// Thème visuel unique par poste — source de vérité pour badges, avatars, terrain.
// Palette dérivée de ARCHITECTURE.md §8.1 (teal/ambre/points) + extensions neutres.
export const POSITION_LABELS: Record<Position, string> = {
  GK: "Gardien",
  LW: "Ailier gauche",
  LB: "Arrière gauche",
  CB: "Demi-centre",
  RB: "Arrière droit",
  RW: "Ailier droit",
  PV: "Pivot",
};

export const POSITION_SHORT: Record<Position, string> = {
  GK: "GB",
  LW: "AG",
  LB: "ARG",
  CB: "DC",
  RB: "ARD",
  RW: "AD",
  PV: "PIV",
};

interface PositionTheme {
  text: string;
  bg: string;
  ring: string;
  gradient: string; // avatar background
}

export const POSITION_THEME: Record<Position, PositionTheme> = {
  GK: { text: "text-accent", bg: "bg-accent/15", ring: "ring-accent/40", gradient: "from-accent/70 to-accent/20" },
  LW: { text: "text-amber-400", bg: "bg-amber-500/15", ring: "ring-amber-400/40", gradient: "from-amber-500/70 to-amber-500/20" },
  LB: { text: "text-sky-400", bg: "bg-sky-500/15", ring: "ring-sky-400/40", gradient: "from-sky-500/70 to-sky-500/20" },
  CB: { text: "text-violet-400", bg: "bg-violet-500/15", ring: "ring-violet-400/40", gradient: "from-violet-500/70 to-violet-500/20" },
  RB: { text: "text-sky-400", bg: "bg-sky-500/15", ring: "ring-sky-400/40", gradient: "from-sky-500/70 to-sky-500/20" },
  RW: { text: "text-amber-400", bg: "bg-amber-500/15", ring: "ring-amber-400/40", gradient: "from-amber-500/70 to-amber-500/20" },
  PV: { text: "text-points-pos", bg: "bg-points-pos/15", ring: "ring-points-pos/40", gradient: "from-points-pos/70 to-points-pos/20" },
};

export function initials(firstName: string, lastName: string): string {
  const a = firstName.trim().charAt(0);
  const b = lastName.trim().charAt(0);
  return `${a}${b}`.toUpperCase() || "?";
}
