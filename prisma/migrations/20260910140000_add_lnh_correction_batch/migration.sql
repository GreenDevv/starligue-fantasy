-- CreateTable
CREATE TABLE "LnhCorrectionBatch" (
    "id" TEXT NOT NULL,
    "gameweekNumber" INTEGER NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedBy" TEXT NOT NULL,
    "correctionCount" INTEGER NOT NULL,
    "report" JSONB NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "notifiedCount" INTEGER NOT NULL DEFAULT 0,
    "dismissedAt" TIMESTAMP(3),

    CONSTRAINT "LnhCorrectionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LnhCorrectionBatch_notifiedAt_dismissedAt_idx" ON "LnhCorrectionBatch"("notifiedAt", "dismissedAt");
