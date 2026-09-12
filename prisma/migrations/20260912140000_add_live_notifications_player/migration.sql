-- AlterTable
ALTER TABLE "User" ADD COLUMN     "liveNotificationsPlayerId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_liveNotificationsPlayerId_fkey" FOREIGN KEY ("liveNotificationsPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
