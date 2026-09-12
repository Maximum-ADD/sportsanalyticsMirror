-- CreateTable
CREATE TABLE "SavedLineup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "budget" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedLineup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedLineupSlot" (
    "id" TEXT NOT NULL,
    "savedLineupId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "predictedPointsAtSave" DOUBLE PRECISION NOT NULL,
    "salaryAtSave" INTEGER NOT NULL,

    CONSTRAINT "SavedLineupSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedLineup_userId_idx" ON "SavedLineup"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedLineupSlot_savedLineupId_playerId_key" ON "SavedLineupSlot"("savedLineupId", "playerId");

-- AddForeignKey
ALTER TABLE "SavedLineup" ADD CONSTRAINT "SavedLineup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedLineupSlot" ADD CONSTRAINT "SavedLineupSlot_savedLineupId_fkey" FOREIGN KEY ("savedLineupId") REFERENCES "SavedLineup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedLineupSlot" ADD CONSTRAINT "SavedLineupSlot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
