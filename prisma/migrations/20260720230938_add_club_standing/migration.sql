-- CreateTable
CREATE TABLE "ClubStanding" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "gameweekNumber" INTEGER NOT NULL,
    "clubId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "played" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "draws" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "goalsFor" INTEGER NOT NULL,
    "goalsAgainst" INTEGER NOT NULL,
    "goalAvg" INTEGER NOT NULL,
    "source" "DataSource" NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubStanding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubStanding_seasonId_gameweekNumber_idx" ON "ClubStanding"("seasonId", "gameweekNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ClubStanding_seasonId_gameweekNumber_clubId_key" ON "ClubStanding"("seasonId", "gameweekNumber", "clubId");

-- AddForeignKey
ALTER TABLE "ClubStanding" ADD CONSTRAINT "ClubStanding_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubStanding" ADD CONSTRAINT "ClubStanding_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
