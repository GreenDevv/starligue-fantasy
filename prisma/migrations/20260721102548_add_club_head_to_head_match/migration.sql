-- CreateTable
CREATE TABLE "ClubHeadToHeadMatch" (
    "id" TEXT NOT NULL,
    "homeClubId" TEXT NOT NULL,
    "awayClubId" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL,
    "seasonLabel" TEXT NOT NULL,
    "homeScore" INTEGER NOT NULL,
    "awayScore" INTEGER NOT NULL,
    "externalIds" JSONB NOT NULL DEFAULT '{}',
    "source" "DataSource" NOT NULL DEFAULT 'LNH_SCRAPER',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubHeadToHeadMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubHeadToHeadMatch_homeClubId_awayClubId_idx" ON "ClubHeadToHeadMatch"("homeClubId", "awayClubId");

-- CreateIndex
CREATE INDEX "ClubHeadToHeadMatch_awayClubId_homeClubId_idx" ON "ClubHeadToHeadMatch"("awayClubId", "homeClubId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubHeadToHeadMatch_homeClubId_awayClubId_playedAt_key" ON "ClubHeadToHeadMatch"("homeClubId", "awayClubId", "playedAt");

-- AddForeignKey
ALTER TABLE "ClubHeadToHeadMatch" ADD CONSTRAINT "ClubHeadToHeadMatch_homeClubId_fkey" FOREIGN KEY ("homeClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubHeadToHeadMatch" ADD CONSTRAINT "ClubHeadToHeadMatch_awayClubId_fkey" FOREIGN KEY ("awayClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

