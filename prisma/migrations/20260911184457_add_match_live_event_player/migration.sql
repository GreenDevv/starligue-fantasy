-- AlterTable
ALTER TABLE "MatchLiveEvent" ADD COLUMN     "playerId" TEXT;

-- AddForeignKey
ALTER TABLE "MatchLiveEvent" ADD CONSTRAINT "MatchLiveEvent_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

