-- CreateTable
CREATE TABLE "GamePrediction" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "homeWinProbability" DOUBLE PRECISION NOT NULL,
    "homeTeamEloPre" DOUBLE PRECISION NOT NULL,
    "awayTeamEloPre" DOUBLE PRECISION NOT NULL,
    "predictedMarginHome" DOUBLE PRECISION,
    "marginMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GamePrediction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GamePrediction_gameId_key" ON "GamePrediction"("gameId");

-- CreateIndex
CREATE INDEX "GamePrediction_gameId_idx" ON "GamePrediction"("gameId");

-- AddForeignKey
ALTER TABLE "GamePrediction" ADD CONSTRAINT "GamePrediction_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
