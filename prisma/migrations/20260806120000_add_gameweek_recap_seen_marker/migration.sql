-- AlterTable
ALTER TABLE "FantasyTeam" ADD COLUMN     "lastPointsSeenGameweekNumber" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SimulationTeam" ADD COLUMN     "lastPointsSeenGameweekNumber" INTEGER NOT NULL DEFAULT 0;
