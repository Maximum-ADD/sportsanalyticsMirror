-- CreateTable
CREATE TABLE "GameMarketOdds" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "homeWinProbability" DOUBLE PRECISION NOT NULL,
    "bookmakerCount" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'the-odds-api',
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameMarketOdds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameMarketOdds_gameId_key" ON "GameMarketOdds"("gameId");

-- CreateIndex
CREATE INDEX "GameMarketOdds_gameId_idx" ON "GameMarketOdds"("gameId");

-- AddForeignKey
ALTER TABLE "GameMarketOdds" ADD CONSTRAINT "GameMarketOdds_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
