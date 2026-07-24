-- CreateEnum
CREATE TYPE "BonusType" AS ENUM ('TRIPLE_CAPTAIN', 'BENCH_BOOST');

-- AlterTable
ALTER TABLE "FantasyLineup" ADD COLUMN     "bonus" "BonusType";

-- AlterTable
ALTER TABLE "FantasyTeam" ADD COLUMN     "pendingBonus" "BonusType";

-- AlterTable
ALTER TABLE "SimulationLineup" ADD COLUMN     "bonus" "BonusType";

-- AlterTable
ALTER TABLE "SimulationTeam" ADD COLUMN     "pendingBonus" "BonusType";

-- CreateTable
CREATE TABLE "SimulationBonusUsage" (
    "id" TEXT NOT NULL,
    "simulationTeamId" TEXT NOT NULL,
    "gameweekId" TEXT NOT NULL,
    "type" "BonusType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulationBonusUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyBonusUsage" (
    "id" TEXT NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "gameweekId" TEXT NOT NULL,
    "type" "BonusType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FantasyBonusUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SimulationBonusUsage_gameweekId_idx" ON "SimulationBonusUsage"("gameweekId");

-- CreateIndex
CREATE UNIQUE INDEX "SimulationBonusUsage_simulationTeamId_type_key" ON "SimulationBonusUsage"("simulationTeamId", "type");

-- CreateIndex
CREATE INDEX "FantasyBonusUsage_gameweekId_idx" ON "FantasyBonusUsage"("gameweekId");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyBonusUsage_fantasyTeamId_type_key" ON "FantasyBonusUsage"("fantasyTeamId", "type");

-- AddForeignKey
ALTER TABLE "SimulationBonusUsage" ADD CONSTRAINT "SimulationBonusUsage_simulationTeamId_fkey" FOREIGN KEY ("simulationTeamId") REFERENCES "SimulationTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationBonusUsage" ADD CONSTRAINT "SimulationBonusUsage_gameweekId_fkey" FOREIGN KEY ("gameweekId") REFERENCES "Gameweek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyBonusUsage" ADD CONSTRAINT "FantasyBonusUsage_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyBonusUsage" ADD CONSTRAINT "FantasyBonusUsage_gameweekId_fkey" FOREIGN KEY ("gameweekId") REFERENCES "Gameweek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
