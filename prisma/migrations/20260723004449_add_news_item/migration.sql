-- CreateEnum
CREATE TYPE "NewsCategory" AS ENUM ('TRANSFER', 'INJURY', 'TEAM_OF_WEEK', 'PERFORMANCE', 'GENERAL');

-- CreateEnum
CREATE TYPE "NewsSourceType" AS ENUM ('LNH_SITE', 'CLUB_SITE', 'GENERATED');

-- CreateTable
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "category" "NewsCategory" NOT NULL,
    "sourceType" "NewsSourceType" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "sourceUrl" TEXT,
    "imageUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "clubId" TEXT,
    "playerId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsItem_dedupeKey_key" ON "NewsItem"("dedupeKey");

-- CreateIndex
CREATE INDEX "NewsItem_seasonId_publishedAt_idx" ON "NewsItem"("seasonId", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "NewsItem_seasonId_category_publishedAt_idx" ON "NewsItem"("seasonId", "category", "publishedAt" DESC);

-- AddForeignKey
ALTER TABLE "NewsItem" ADD CONSTRAINT "NewsItem_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsItem" ADD CONSTRAINT "NewsItem_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsItem" ADD CONSTRAINT "NewsItem_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

