-- AlterTable
ALTER TABLE "SimulationTradeProposal" ADD COLUMN     "leagueId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "SimulationTradeProposal_leagueId_idx" ON "SimulationTradeProposal"("leagueId");

-- AddForeignKey
ALTER TABLE "SimulationTradeProposal" ADD CONSTRAINT "SimulationTradeProposal_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

