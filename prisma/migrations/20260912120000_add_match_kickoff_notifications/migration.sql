-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "kickoffReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "kickoffNotifiedAt" TIMESTAMP(3);
