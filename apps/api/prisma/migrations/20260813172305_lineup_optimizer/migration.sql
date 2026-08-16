-- CreateTable
CREATE TABLE "PlayerPrediction" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "predictedFantasyPoints" DOUBLE PRECISION NOT NULL,
    "salary" INTEGER NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lineup" (
    "id" TEXT NOT NULL,
    "totalPredictedPoints" DOUBLE PRECISION NOT NULL,
    "totalSalary" INTEGER NOT NULL,
    "budget" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lineup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineupSlot" (
    "id" TEXT NOT NULL,
    "lineupId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,

    CONSTRAINT "LineupSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerPrediction_playerId_asOf_idx" ON "PlayerPrediction"("playerId", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "LineupSlot_lineupId_playerId_key" ON "LineupSlot"("lineupId", "playerId");

-- AddForeignKey
ALTER TABLE "PlayerPrediction" ADD CONSTRAINT "PlayerPrediction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineupSlot" ADD CONSTRAINT "LineupSlot_lineupId_fkey" FOREIGN KEY ("lineupId") REFERENCES "Lineup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineupSlot" ADD CONSTRAINT "LineupSlot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
