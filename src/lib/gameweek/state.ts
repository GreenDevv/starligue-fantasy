// État de confiance d'une journée — fonction PURE (aucun import Prisma).
//
//   UPCOMING          deadline pas encore passée
//   LIVE              deadline passée, au moins un match pas terminé → 🟡 (danger)
//   AWAITING_RESULTS  tous les matchs terminés, points pas encore calculés → 🟠
//   PROVISIONAL       points calculés mais pas encore confirmés → 🟠
//                     (la LNH révise ses notes 2-3 j après, ARCHITECTURE.md §4.3)
//   CONFIRMED         confirmedAt posé par le cron corrections du mardi → 🟢
//
// `confirmedAt` est posé APRÈS relecture LNH (avec ou sans correction), donc une
// journée CONFIRMED est toujours passée par PROVISIONAL. `isScored` reste "points
// calculés au moins une fois" (rejouable).

export type GameweekState = "UPCOMING" | "LIVE" | "AWAITING_RESULTS" | "PROVISIONAL" | "CONFIRMED";

export type GameweekTone = "neutral" | "danger" | "attention" | "confirmed";

export interface GameweekStateInput {
  deadlineAt: Date;
  isScored: boolean;
  confirmedAt: Date | null;
  matchStatuses: string[]; // MatchStatus[] — "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" | "CANCELLED"
  now?: Date;
}

export interface GameweekStateResult {
  state: GameweekState;
  tone: GameweekTone;
  matchesTotal: number;
  matchesFinished: number;
  anyMatchLive: boolean;
  allMatchesSettled: boolean; // FINISHED / POSTPONED / CANCELLED — plus rien à jouer
  /** true tant que les points affichés peuvent encore changer (LIVE/AWAITING/PROVISIONAL). */
  pointsMayChange: boolean;
}

const TONE_BY_STATE: Record<GameweekState, GameweekTone> = {
  UPCOMING: "neutral",
  LIVE: "danger",
  AWAITING_RESULTS: "attention",
  PROVISIONAL: "attention",
  CONFIRMED: "confirmed",
};

// Un match "réglé" ne sera plus joué : terminé, reporté (compte comme non-bloquant
// pour le scoring, cf. computeGameweekScores qui exige juste ≥1 stat/match) ou annulé.
const SETTLED_STATUSES = new Set(["FINISHED", "POSTPONED", "CANCELLED"]);

export function getGameweekState(input: GameweekStateInput): GameweekStateResult {
  const now = input.now ?? new Date();
  const statuses = input.matchStatuses;
  const matchesTotal = statuses.length;
  const matchesFinished = statuses.filter((s) => s === "FINISHED").length;
  const anyMatchLive = statuses.some((s) => s === "LIVE");
  const allMatchesSettled = matchesTotal > 0 && statuses.every((s) => SETTLED_STATUSES.has(s));

  let state: GameweekState;
  if (input.confirmedAt) {
    state = "CONFIRMED";
  } else if (input.isScored) {
    state = "PROVISIONAL";
  } else if (now < input.deadlineAt) {
    state = "UPCOMING";
  } else if (matchesTotal === 0 || !allMatchesSettled) {
    // deadline passée mais il reste des matchs à jouer (ou aucun match connu)
    state = "LIVE";
  } else {
    state = "AWAITING_RESULTS";
  }

  return {
    state,
    tone: TONE_BY_STATE[state],
    matchesTotal,
    matchesFinished,
    anyMatchLive,
    allMatchesSettled,
    pointsMayChange: state === "LIVE" || state === "AWAITING_RESULTS" || state === "PROVISIONAL",
  };
}
