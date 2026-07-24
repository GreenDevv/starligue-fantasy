/*
  Warnings:

  - You are about to drop the column `goals` on the `PlayerMatchStat` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PlayerMatchStat" DROP COLUMN "goals",
ADD COLUMN     "assists" INTEGER,
ADD COLUMN     "ballsRecovered" INTEGER,
ADD COLUMN     "disqualified" INTEGER,
ADD COLUMN     "goalsPenalty" INTEGER,
ADD COLUMN     "goalsPlay" INTEGER,
ADD COLUMN     "goalsTotal" INTEGER,
ADD COLUMN     "neutralizations" INTEGER,
ADD COLUMN     "opponentShotsBlocked" INTEGER,
ADD COLUMN     "penaltiesDrawn" INTEGER,
ADD COLUMN     "shotPercentage" DECIMAL(5,2),
ADD COLUMN     "shotsPenalty" INTEGER,
ADD COLUMN     "shotsPlay" INTEGER,
ADD COLUMN     "shotsTotal" INTEGER,
ADD COLUMN     "turnovers" INTEGER,
ADD COLUMN     "twoMinDrawn" INTEGER,
ADD COLUMN     "twoMinTaken" INTEGER;
