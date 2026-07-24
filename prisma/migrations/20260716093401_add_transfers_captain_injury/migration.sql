-- AlterTable
ALTER TABLE "FantasyTeam" ADD COLUMN     "captainId" TEXT,
ADD COLUMN     "jokersUsed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "injuredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PlayerValueHistory" ADD COLUMN     "gameweekId" TEXT;

-- AlterTable
ALTER TABLE "SimulationTeam" ADD COLUMN     "captainId" TEXT,
ADD COLUMN     "jokersUsed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TransferWindow" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransferWindow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransferWindow_seasonId_idx" ON "TransferWindow"("seasonId");

-- CreateIndex
CREATE INDEX "PlayerValueHistory_gameweekId_idx" ON "PlayerValueHistory"("gameweekId");

-- AddForeignKey
ALTER TABLE "PlayerValueHistory" ADD CONSTRAINT "PlayerValueHistory_gameweekId_fkey" FOREIGN KEY ("gameweekId") REFERENCES "Gameweek"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferWindow" ADD CONSTRAINT "TransferWindow_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationTeam" ADD CONSTRAINT "SimulationTeam_captainId_fkey" FOREIGN KEY ("captainId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTeam" ADD CONSTRAINT "FantasyTeam_captainId_fkey" FOREIGN KEY ("captainId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
