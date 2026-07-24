-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TradeSide" AS ENUM ('PROPOSER', 'RECEIVER');

-- AlterTable
ALTER TABLE "FantasyTeam" ADD COLUMN     "pointsConverted" DECIMAL(8,1) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PointsBudgetConversion" (
    "id" TEXT NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "pointsSpent" DECIMAL(8,1) NOT NULL,
    "budgetGained" DECIMAL(6,1) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsBudgetConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeProposal" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "proposingTeamId" TEXT NOT NULL,
    "receivingTeamId" TEXT NOT NULL,
    "budgetAdjustment" DECIMAL(6,1) NOT NULL DEFAULT 0,
    "status" "TradeStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeProposalPlayer" (
    "id" TEXT NOT NULL,
    "tradeProposalId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,

    CONSTRAINT "TradeProposalPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointsBudgetConversion_fantasyTeamId_idx" ON "PointsBudgetConversion"("fantasyTeamId");

-- CreateIndex
CREATE INDEX "TradeProposal_receivingTeamId_status_idx" ON "TradeProposal"("receivingTeamId", "status");

-- CreateIndex
CREATE INDEX "TradeProposal_proposingTeamId_status_idx" ON "TradeProposal"("proposingTeamId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TradeProposalPlayer_tradeProposalId_playerId_key" ON "TradeProposalPlayer"("tradeProposalId", "playerId");

-- AddForeignKey
ALTER TABLE "PointsBudgetConversion" ADD CONSTRAINT "PointsBudgetConversion_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeProposal" ADD CONSTRAINT "TradeProposal_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeProposal" ADD CONSTRAINT "TradeProposal_proposingTeamId_fkey" FOREIGN KEY ("proposingTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeProposal" ADD CONSTRAINT "TradeProposal_receivingTeamId_fkey" FOREIGN KEY ("receivingTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeProposalPlayer" ADD CONSTRAINT "TradeProposalPlayer_tradeProposalId_fkey" FOREIGN KEY ("tradeProposalId") REFERENCES "TradeProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeProposalPlayer" ADD CONSTRAINT "TradeProposalPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
