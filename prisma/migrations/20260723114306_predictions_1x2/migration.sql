-- AlterEnum : 5 bandes -> 1X2, en remappant les 8 lignes Prediction existantes
-- (AWAY_BIG/AWAY_SMALL -> AWAY, HOME_SMALL/HOME_BIG -> HOME, DRAW inchangé)
-- plutôt qu'un simple cast texte (qui échouerait sur les valeurs supprimées).
BEGIN;
CREATE TYPE "PredictionOutcome_new" AS ENUM ('HOME', 'DRAW', 'AWAY');
ALTER TABLE "Prediction" ALTER COLUMN "outcome" TYPE "PredictionOutcome_new" USING (
  CASE "outcome"::text
    WHEN 'HOME_BIG' THEN 'HOME'
    WHEN 'HOME_SMALL' THEN 'HOME'
    WHEN 'DRAW' THEN 'DRAW'
    WHEN 'AWAY_SMALL' THEN 'AWAY'
    WHEN 'AWAY_BIG' THEN 'AWAY'
  END::"PredictionOutcome_new"
);
ALTER TYPE "PredictionOutcome" RENAME TO "PredictionOutcome_old";
ALTER TYPE "PredictionOutcome_new" RENAME TO "PredictionOutcome";
DROP TYPE "PredictionOutcome_old";
COMMIT;

-- AlterTable : les cotes sont purement informatives (voir odds.ts) -- les 240
-- lignes existantes reçoivent une valeur temporaire (2.00) immédiatement
-- recalculée par un script de backfill juste après la migration, plutôt que
-- d'essayer de dériver une approximation depuis les anciennes colonnes 5 bandes.
ALTER TABLE "PredictionMarket" ADD COLUMN "oddsHome" DECIMAL(4,2) NOT NULL DEFAULT 2.00;
ALTER TABLE "PredictionMarket" ADD COLUMN "oddsAway" DECIMAL(4,2) NOT NULL DEFAULT 2.00;
ALTER TABLE "PredictionMarket" ALTER COLUMN "oddsHome" DROP DEFAULT;
ALTER TABLE "PredictionMarket" ALTER COLUMN "oddsAway" DROP DEFAULT;
ALTER TABLE "PredictionMarket" DROP COLUMN "oddsAwayBig";
ALTER TABLE "PredictionMarket" DROP COLUMN "oddsAwaySmall";
ALTER TABLE "PredictionMarket" DROP COLUMN "oddsHomeBig";
ALTER TABLE "PredictionMarket" DROP COLUMN "oddsHomeSmall";
