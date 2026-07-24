// Script ponctuel : exécute la même logique que POST /api/admin/simulation/setup
// en direct (pas de session admin dispo hors navigateur pour tester manuellement).
import { setupSimulationSeason } from "../src/lib/simulation/setup";

async function main() {
  const result = await setupSimulationSeason({
    seasonLabel: "2025-2026",
    lnhSeasonsId: "39",
    seasonStartYear: 2025,
    priorLnhSeasonsId: "37",
    priorSeasonLabel: "2024/2025",
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
