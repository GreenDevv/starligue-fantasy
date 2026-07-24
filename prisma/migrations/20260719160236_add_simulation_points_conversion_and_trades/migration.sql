-- AlterTable
ALTER TABLE "SimulationTeam" ADD COLUMN     "pointsConverted" DECIMAL(8,1) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SimulationPointsBudgetConversion" (
    "id" TEXT NOT NULL,
    "simulationTeamId" TEXT NOT NULL,
    "pointsSpent" DECIMAL(8,1) NOT NULL,
    "budgetGained" DECIMAL(6,1) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulationPointsBudgetConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulationTradeProposal" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "proposingTeamId" TEXT NOT NULL,
    "receivingTeamId" TEXT NOT NULL,
    "budgetAdjustment" DECIMAL(6,1) NOT NULL DEFAULT 0,
    "status" "TradeStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulationTradeProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulationTradeProposalPlayer" (
    "id" TEXT NOT NULL,
    "simulationTradeProposalId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,

    CONSTRAINT "SimulationTradeProposalPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SimulationPointsBudgetConversion_simulationTeamId_idx" ON "SimulationPointsBudgetConversion"("simulationTeamId");

-- CreateIndex
CREATE INDEX "SimulationTradeProposal_receivingTeamId_status_idx" ON "SimulationTradeProposal"("receivingTeamId", "status");

-- CreateIndex
CREATE INDEX "SimulationTradeProposal_proposingTeamId_status_idx" ON "SimulationTradeProposal"("proposingTeamId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SimulationTradeProposalPlayer_simulationTradeProposalId_pla_key" ON "SimulationTradeProposalPlayer"("simulationTradeProposalId", "playerId");

-- AddForeignKey
ALTER TABLE "SimulationPointsBudgetConversion" ADD CONSTRAINT "SimulationPointsBudgetConversion_simulationTeamId_fkey" FOREIGN KEY ("simulationTeamId") REFERENCES "SimulationTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationTradeProposal" ADD CONSTRAINT "SimulationTradeProposal_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationTradeProposal" ADD CONSTRAINT "SimulationTradeProposal_proposingTeamId_fkey" FOREIGN KEY ("proposingTeamId") REFERENCES "SimulationTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationTradeProposal" ADD CONSTRAINT "SimulationTradeProposal_receivingTeamId_fkey" FOREIGN KEY ("receivingTeamId") REFERENCES "SimulationTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationTradeProposalPlayer" ADD CONSTRAINT "SimulationTradeProposalPlayer_simulationTradeProposalId_fkey" FOREIGN KEY ("simulationTradeProposalId") REFERENCES "SimulationTradeProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationTradeProposalPlayer" ADD CONSTRAINT "SimulationTradeProposalPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
