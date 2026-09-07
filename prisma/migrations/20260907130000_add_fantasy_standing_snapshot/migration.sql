-- CreateEnum
CREATE TYPE "SeasonMode" AS ENUM ('LIVE', 'SIMULATION');

-- CreateTable
CREATE TABLE "FantasyStandingSnapshot" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "mode" "SeasonMode" NOT NULL,
    "gameweekNumber" INTEGER NOT NULL,
    "teamId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "globalRank" INTEGER NOT NULL,
    "leagueRank" INTEGER NOT NULL,
    "cumulativePoints" DECIMAL(8,1) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FantasyStandingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FantasyStandingSnapshot_seasonId_mode_gameweekNumber_idx" ON "FantasyStandingSnapshot"("seasonId", "mode", "gameweekNumber");

-- CreateIndex
CREATE INDEX "FantasyStandingSnapshot_mode_teamId_idx" ON "FantasyStandingSnapshot"("mode", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyStandingSnapshot_seasonId_mode_gameweekNumber_teamId_key" ON "FantasyStandingSnapshot"("seasonId", "mode", "gameweekNumber", "teamId");

-- AddForeignKey
ALTER TABLE "FantasyStandingSnapshot" ADD CONSTRAINT "FantasyStandingSnapshot_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
