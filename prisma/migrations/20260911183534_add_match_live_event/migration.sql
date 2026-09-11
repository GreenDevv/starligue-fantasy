-- CreateTable
CREATE TABLE "MatchLiveEvent" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "minute" INTEGER NOT NULL,
    "icon" TEXT NOT NULL,
    "homeScore" INTEGER NOT NULL,
    "awayScore" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchLiveEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchLiveEvent_matchId_idx" ON "MatchLiveEvent"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchLiveEvent_matchId_sequence_key" ON "MatchLiveEvent"("matchId", "sequence");

-- AddForeignKey
ALTER TABLE "MatchLiveEvent" ADD CONSTRAINT "MatchLiveEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

