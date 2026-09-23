-- Links an undo to the correction it reverts (see EventCorrection's schema
-- doc comment). Deliberately only this change: `prisma migrate diff` also
-- reports pre-existing drift (DROP INDEX "IngestionBatch_reviewedById_idx"
-- and IngestionSchedule.updatedAt's default) that isn't this migration's to fix.

-- AlterTable
ALTER TABLE "EventCorrection" ADD COLUMN "revertsCorrectionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "EventCorrection_revertsCorrectionId_key" ON "EventCorrection"("revertsCorrectionId");

-- AddForeignKey
ALTER TABLE "EventCorrection" ADD CONSTRAINT "EventCorrection_revertsCorrectionId_fkey" FOREIGN KEY ("revertsCorrectionId") REFERENCES "EventCorrection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
