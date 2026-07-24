-- CreateTable
CREATE TABLE "PlayerLnhSeasonStat" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "seasonLabel" TEXT NOT NULL,
    "lnhSeasonsId" TEXT NOT NULL,
    "matchesPlayed" INTEGER NOT NULL,
    "totalLnhScore" DECIMAL(7,1) NOT NULL,
    "avgLnhScore" DECIMAL(5,2) NOT NULL,
    "source" "DataSource" NOT NULL DEFAULT 'LNH_SCRAPER',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerLnhSeasonStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerLnhSeasonStat_seasonLabel_idx" ON "PlayerLnhSeasonStat"("seasonLabel");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerLnhSeasonStat_playerId_seasonLabel_key" ON "PlayerLnhSeasonStat"("playerId", "seasonLabel");

-- AddForeignKey
ALTER TABLE "PlayerLnhSeasonStat" ADD CONSTRAINT "PlayerLnhSeasonStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
