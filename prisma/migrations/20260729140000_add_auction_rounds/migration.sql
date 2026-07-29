-- CreateEnum
CREATE TYPE "AuctionRoundStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "AuctionRound" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "status" "AuctionRoundStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionRoundSubmission" (
    "id" TEXT NOT NULL,
    "auctionRoundId" TEXT NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionRoundSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionBid" (
    "id" TEXT NOT NULL,
    "auctionRoundId" TEXT NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "amount" DECIMAL(6,1) NOT NULL,
    "won" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionBid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuctionRound_leagueId_roundNumber_key" ON "AuctionRound"("leagueId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionRoundSubmission_auctionRoundId_fantasyTeamId_key" ON "AuctionRoundSubmission"("auctionRoundId", "fantasyTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionBid_auctionRoundId_fantasyTeamId_playerId_key" ON "AuctionBid"("auctionRoundId", "fantasyTeamId", "playerId");

-- AddForeignKey
ALTER TABLE "AuctionRound" ADD CONSTRAINT "AuctionRound_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionRoundSubmission" ADD CONSTRAINT "AuctionRoundSubmission_auctionRoundId_fkey" FOREIGN KEY ("auctionRoundId") REFERENCES "AuctionRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionRoundSubmission" ADD CONSTRAINT "AuctionRoundSubmission_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_auctionRoundId_fkey" FOREIGN KEY ("auctionRoundId") REFERENCES "AuctionRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
