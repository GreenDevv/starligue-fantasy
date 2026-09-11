-- AlterTable
ALTER TABLE "User" ADD COLUMN     "liveNotificationsClubIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "liveNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "liveNotificationsOnlyMyPlayers" BOOLEAN NOT NULL DEFAULT false;

