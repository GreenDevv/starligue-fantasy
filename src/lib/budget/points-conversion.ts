// Conversion de points de saison en budget de transfert — fonction PURE, aucun
// import Prisma. Déclenchée manuellement par l'utilisateur, uniquement pendant une
// fenêtre de transfert ouverte (contrôlé côté route). Les points convertis sortent
// définitivement de totalPoints — voir src/lib/scoring/compute.ts::recalcTotalPoints,
// qui soustrait FantasyTeam.pointsConverted du total recalculé à chaque journée pour
// que la conversion ne soit jamais écrasée par un recompute.

export interface PointsConversionInput {
  availablePoints: number; // totalPoints courant de l'équipe (déjà net des conversions précédentes)
  amount: number; // points que l'utilisateur souhaite convertir
  rate: number; // GameConfig POINTS_TO_BUDGET_RATE
}

export type PointsConversionError =
  | { code: "AMOUNT_NOT_POSITIVE" }
  | { code: "AMOUNT_EXCEEDS_AVAILABLE"; available: number };

export interface PointsConversionResult {
  valid: boolean;
  errors: PointsConversionError[];
  budgetGained: number;
}

export function validatePointsConversion(input: PointsConversionInput): PointsConversionResult {
  const { availablePoints, amount, rate } = input;
  const errors: PointsConversionError[] = [];

  if (!(amount > 0)) {
    errors.push({ code: "AMOUNT_NOT_POSITIVE" });
  }

  const availableRounded = Math.round(availablePoints * 10) / 10;
  if (amount > availableRounded) {
    errors.push({ code: "AMOUNT_EXCEEDS_AVAILABLE", available: availableRounded });
  }

  const budgetGained = Math.round(amount * rate * 10) / 10;

  return { valid: errors.length === 0, errors, budgetGained };
}
