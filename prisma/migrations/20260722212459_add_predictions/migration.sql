-- CreateEnum
CREATE TYPE "PredictionOutcome" AS ENUM ('AWAY_BIG', 'AWAY_SMALL', 'DRAW', 'HOME_SMALL', 'HOME_BIG');

-- CreateTable
CREATE TABLE "PredictionMarket" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "oddsAwayBig" DECIMAL(4,2) NOT NULL,
    "oddsAwaySmall" DECIMAL(4,2) NOT NULL,
    "oddsDraw" DECIMAL(4,2) NOT NULL,
    "oddsHomeSmall" DECIMAL(4,2) NOT NULL,
    "oddsHomeBig" DECIMAL(4,2) NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PredictionMarket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "outcome" "PredictionOutcome" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PredictionMarket_matchId_key" ON "PredictionMarket"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "Prediction_fantasyTeamId_marketId_key" ON "Prediction"("fantasyTeamId", "marketId");

-- AddForeignKey
ALTER TABLE "PredictionMarket" ADD CONSTRAINT "PredictionMarket_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "PredictionMarket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
