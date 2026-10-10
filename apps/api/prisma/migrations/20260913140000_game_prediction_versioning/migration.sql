-- AlterTable
-- Backfilled via DEFAULT rather than a separate UPDATE pass: every existing
-- GamePrediction row predates model versioning, so "unversioned" is the
-- honest label for what produced them, not a guess.
ALTER TABLE "GamePrediction" ADD COLUMN "modelVersion" TEXT NOT NULL DEFAULT 'unversioned';

-- CreateTable
CREATE TABLE "GamePredictionRun" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "homeWinProbability" DOUBLE PRECISION NOT NULL,
    "homeTeamEloPre" DOUBLE PRECISION NOT NULL,
    "awayTeamEloPre" DOUBLE PRECISION NOT NULL,
    "predictedMarginHome" DOUBLE PRECISION,
    "marginMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GamePredictionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GamePredictionRun_gameId_modelVersion_key" ON "GamePredictionRun"("gameId", "modelVersion");

-- CreateIndex
CREATE INDEX "GamePredictionRun_gameId_idx" ON "GamePredictionRun"("gameId");

-- AddForeignKey
ALTER TABLE "GamePredictionRun" ADD CONSTRAINT "GamePredictionRun_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
