-- CreateTable
CREATE TABLE "FriendlyMatch" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "competitionLabel" TEXT NOT NULL,
    "kickoffAt" TIMESTAMP(3) NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "homeClubId" TEXT,
    "homeClubName" TEXT NOT NULL,
    "awayClubId" TEXT,
    "awayClubName" TEXT NOT NULL,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "source" "DataSource" NOT NULL DEFAULT 'LNH_SCRAPER',
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FriendlyMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FriendlyMatch_dedupeKey_key" ON "FriendlyMatch"("dedupeKey");

-- CreateIndex
CREATE INDEX "FriendlyMatch_seasonId_kickoffAt_idx" ON "FriendlyMatch"("seasonId", "kickoffAt");

-- AddForeignKey
ALTER TABLE "FriendlyMatch" ADD CONSTRAINT "FriendlyMatch_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendlyMatch" ADD CONSTRAINT "FriendlyMatch_homeClubId_fkey" FOREIGN KEY ("homeClubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendlyMatch" ADD CONSTRAINT "FriendlyMatch_awayClubId_fkey" FOREIGN KEY ("awayClubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;
