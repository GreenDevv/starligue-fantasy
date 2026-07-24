-- DropForeignKey
ALTER TABLE "FantasyTeam" DROP CONSTRAINT "FantasyTeam_leagueId_fkey";

-- AlterTable
ALTER TABLE "FantasyTeam" ALTER COLUMN "jerseyConfig" SET NOT NULL,
ALTER COLUMN "leagueId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "FantasyTeam" ADD CONSTRAINT "FantasyTeam_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

