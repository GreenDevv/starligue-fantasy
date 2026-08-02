-- AlterTable
ALTER TABLE "FriendlyMatch" ADD COLUMN "groupLabel" TEXT;

-- CreateIndex
CREATE INDEX "FriendlyMatch_competitionLabel_groupLabel_idx" ON "FriendlyMatch"("competitionLabel", "groupLabel");
