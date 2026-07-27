-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "gameweekId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "permalink" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialPost_dedupeKey_key" ON "SocialPost"("dedupeKey");

-- CreateIndex
CREATE INDEX "SocialPost_gameweekId_idx" ON "SocialPost"("gameweekId");

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_gameweekId_fkey" FOREIGN KEY ("gameweekId") REFERENCES "Gameweek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

