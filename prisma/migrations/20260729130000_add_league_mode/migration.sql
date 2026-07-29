-- CreateEnum
CREATE TYPE "LeagueMode" AS ENUM ('CLASSIC', 'AUCTION');

-- AlterTable
ALTER TABLE "League" ADD COLUMN     "mode" "LeagueMode" NOT NULL DEFAULT 'CLASSIC';
