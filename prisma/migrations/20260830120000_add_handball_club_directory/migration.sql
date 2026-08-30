-- CreateEnum
CREATE TYPE "HandballClubSource" AS ENUM ('FFHANDBALL', 'MANUAL', 'OSM');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "homeClubId" TEXT;

-- CreateTable
CREATE TABLE "HandballClub" (
    "id" TEXT NOT NULL,
    "externalIds" JSONB NOT NULL DEFAULT '{}',
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'FR',
    "city" TEXT,
    "zipcode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "website" TEXT,
    "logoUrl" TEXT,
    "source" "HandballClubSource" NOT NULL DEFAULT 'FFHANDBALL',
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HandballClub_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HandballClub_slug_key" ON "HandballClub"("slug");

-- CreateIndex
CREATE INDEX "HandballClub_country_verified_idx" ON "HandballClub"("country", "verified");

-- CreateIndex
CREATE INDEX "HandballClub_name_idx" ON "HandballClub"("name");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_homeClubId_fkey" FOREIGN KEY ("homeClubId") REFERENCES "HandballClub"("id") ON DELETE SET NULL ON UPDATE CASCADE;
