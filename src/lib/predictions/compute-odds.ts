// Création des marchés de pronostic (cotes) pour les matchs à venir — appelé par
// le cron compute-prediction-odds (ARCHITECTURE.md §14). Idempotent : upsert par
// matchId, un match qui a déjà un PredictionMarket n'est jamais recalculé (les
// cotes doivent rester figées, un pronostic se juge sur les cotes vues au moment
// du pari).
import { prisma } from "@/lib/db";
import { Decimal } from "@prisma/client/runtime/library";
import { computeMatchOdds, parseOddsConfig } from "./odds";

/**
 * Force d'un club = valeur marchande moyenne de son effectif actif — proxy simple
 * et toujours disponible dès le seed (contrairement au classement LNH, vide en
 * pré-saison). Calculée en une passe pour tous les clubs concernés.
 */
async function computeClubStrengths(clubIds: string[]): Promise<Map<string, number>> {
  const players = await prisma.player.findMany({
    where: { clubId: { in: clubIds }, isActive: true },
    select: { clubId: true, marketValue: true },
  });

  const strengths = new Map<string, number>();
  for (const clubId of clubIds) {
    const clubPlayers = players.filter((p) => p.clubId === clubId);
    const avg = clubPlayers.length
      ? clubPlayers.reduce((sum, p) => sum + Number(p.marketValue), 0) / clubPlayers.length
      : 0;
    strengths.set(clubId, avg);
  }
  return strengths;
}

/**
 * Crée un PredictionMarket pour chaque match programmé de la saison qui n'en a pas
 * encore un. v1 : jeu en direct uniquement (voir ARCHITECTURE.md §14).
 */
export async function ensurePredictionMarkets(seasonId: string): Promise<{ created: number }> {
  const matches = await prisma.match.findMany({
    where: { seasonId, status: "SCHEDULED", predictionMarket: null },
    select: { id: true, homeClubId: true, awayClubId: true },
  });
  if (matches.length === 0) return { created: 0 };

  const configs = await prisma.gameConfig.findMany();
  const rawConfig = Object.fromEntries(configs.map((c) => [c.key, c.value]));
  const oddsConfig = parseOddsConfig(rawConfig);

  const clubIds = Array.from(new Set(matches.flatMap((m) => [m.homeClubId, m.awayClubId])));
  const strengths = await computeClubStrengths(clubIds);

  let created = 0;
  for (const match of matches) {
    const odds = computeMatchOdds(
      {
        homeStrength: strengths.get(match.homeClubId) ?? 0,
        awayStrength: strengths.get(match.awayClubId) ?? 0,
      },
      oddsConfig,
    );
    await prisma.predictionMarket.upsert({
      where: { matchId: match.id },
      update: {},
      create: {
        matchId: match.id,
        oddsHome: new Decimal(odds.HOME),
        oddsDraw: new Decimal(odds.DRAW),
        oddsAway: new Decimal(odds.AWAY),
      },
    });
    created++;
  }

  return { created };
}
