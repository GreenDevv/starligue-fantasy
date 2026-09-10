-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "liveMinute" INTEGER,
ADD COLUMN     "livePeriod" TEXT,
ADD COLUMN     "liveUpdatedAt" TIMESTAMP(3);
