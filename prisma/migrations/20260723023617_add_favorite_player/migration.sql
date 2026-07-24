-- AlterTable
ALTER TABLE "User" ADD COLUMN     "favoritePlayerId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_favoritePlayerId_fkey" FOREIGN KEY ("favoritePlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

