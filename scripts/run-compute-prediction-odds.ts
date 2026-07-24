// Script ponctuel : exécute la même logique que /api/cron/compute-prediction-odds
// en direct (pas de secret cron dispo hors déploiement pour tester manuellement).
import { PrismaClient } from "@prisma/client";
import { ensurePredictionMarkets } from "../src/lib/predictions/compute-odds";

const prisma = new PrismaClient();

async function main() {
  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) throw new Error("Aucune saison active");

  const result = await ensurePredictionMarkets(season.id);
  console.log(JSON.stringify({ season: season.label, ...result }, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
