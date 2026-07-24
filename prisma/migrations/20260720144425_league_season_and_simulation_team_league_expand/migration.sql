-- DropIndex
DROP INDEX "SimulationTeam_userId_seasonId_key";

-- AlterTable
ALTER TABLE "League" ADD COLUMN     "seasonId" TEXT;

-- Backfill : toutes les ligues existantes sont des ligues du jeu en direct au
-- moment de cette migration (le Mode Simulation n'avait pas de notion de ligue
-- avant ce changement) → rattachées à la saison live isActive=true.
UPDATE "League" SET "seasonId" = (SELECT id FROM "Season" WHERE "isActive" = true LIMIT 1) WHERE "seasonId" IS NULL;

ALTER TABLE "League" ALTER COLUMN "seasonId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Season" ADD COLUMN     "currentSimulationGameweekNumber" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SimulationTeam" ADD COLUMN     "leagueId" TEXT;

-- CreateIndex
CREATE INDEX "League_seasonId_idx" ON "League"("seasonId");

-- CreateIndex
CREATE INDEX "SimulationTeam_seasonId_idx" ON "SimulationTeam"("seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "SimulationTeam_userId_leagueId_key" ON "SimulationTeam"("userId", "leagueId");

-- AddForeignKey
ALTER TABLE "SimulationTeam" ADD CONSTRAINT "SimulationTeam_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

