-- DropIndex
DROP INDEX "FantasyTeam_userId_key";

-- AlterTable
ALTER TABLE "FantasyTeam" ADD COLUMN     "jerseyConfig" JSONB,
ADD COLUMN     "leagueId" TEXT;

-- CreateIndex
CREATE INDEX "FantasyTeam_leagueId_totalPoints_idx" ON "FantasyTeam"("leagueId", "totalPoints" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "FantasyTeam_userId_leagueId_key" ON "FantasyTeam"("userId", "leagueId");

-- AddForeignKey
ALTER TABLE "FantasyTeam" ADD CONSTRAINT "FantasyTeam_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE SET NULL ON UPDATE CASCADE;

