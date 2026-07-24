-- DropForeignKey
ALTER TABLE "SimulationTeam" DROP CONSTRAINT "SimulationTeam_leagueId_fkey";

-- AlterTable
ALTER TABLE "SimulationTeam" ALTER COLUMN "leagueId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "SimulationTeam" ADD CONSTRAINT "SimulationTeam_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

