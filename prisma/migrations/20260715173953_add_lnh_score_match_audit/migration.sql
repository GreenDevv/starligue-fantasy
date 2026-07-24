-- AlterTable
ALTER TABLE "PlayerLnhSeasonStat" ADD COLUMN     "matchedByNameOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scrapedClub" TEXT;
