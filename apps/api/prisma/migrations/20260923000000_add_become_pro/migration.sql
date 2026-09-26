-- Become Pro: a user's own self-reported seasons, the per-game box scores
-- they are derived from, the valuations the API computes from them, and the
-- trained draft-slot model it computes them with.
--
-- Private to each user: there is no leaderboard, no cross-user comparison, and
-- so no verification of what a user enters — see the schema comment above
-- ProspectSeason.
--
-- Generated with `prisma migrate diff` from the migration history to the
-- schema. Two statements it emitted were removed by hand: a DROP INDEX on
-- IngestionBatch_reviewedById_idx and a DROP DEFAULT on
-- IngestionSchedule.updatedAt. They appear even when replaying the history
-- into an empty shadow database, so they come from a pre-existing mismatch
-- between main's migrations and schema.prisma — not from this change — and
-- shipping them here would silently alter the ingestion tables on every
-- environment this is deployed to.

-- CreateEnum
CREATE TYPE "CompetitionLevel" AS ENUM ('NCAA_D1', 'NCAA_D2', 'NCAA_D3', 'NAIA', 'JUCO', 'INTERNATIONAL_PRO', 'SEMI_PRO', 'HIGH_SCHOOL', 'REC');

-- CreateTable
CREATE TABLE "ProspectSeason" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "competitionLevel" "CompetitionLevel" NOT NULL,
    "position" TEXT NOT NULL,
    "teamName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectSeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectGame" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "gameDate" TIMESTAMP(3) NOT NULL,
    "opponent" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "rebounds" INTEGER NOT NULL,
    "assists" INTEGER NOT NULL,
    "steals" INTEGER NOT NULL,
    "blocks" INTEGER NOT NULL,
    "turnovers" INTEGER NOT NULL,
    "fieldGoalsMade" INTEGER NOT NULL,
    "fieldGoalsAttempted" INTEGER NOT NULL,
    "threesMade" INTEGER NOT NULL,
    "threesAttempted" INTEGER NOT NULL,
    "freeThrowsMade" INTEGER NOT NULL,
    "freeThrowsAttempted" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectValuation" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "projectedDraftSlot" INTEGER,
    "projectedValueUsd" INTEGER,
    "projectedValueLowUsd" INTEGER,
    "projectedValueHighUsd" INTEGER,
    "rookieScaleYear" TEXT NOT NULL,
    "levelFactor" DOUBLE PRECISION NOT NULL,
    "levelFactorBasis" TEXT NOT NULL,
    "drivers" JSONB NOT NULL,
    "comparablePlayerIds" TEXT[],
    "comparableScores" DOUBLE PRECISION[],
    "slotAlumniPlayerIds" TEXT[],
    "modelVersion" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modelId" TEXT,

    CONSTRAINT "ProspectValuation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectValuationModel" (
    "id" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "bundle" JSONB NOT NULL,
    "trainingRows" INTEGER NOT NULL,
    "mae" DOUBLE PRECISION NOT NULL,
    "rankCorrelation" DOUBLE PRECISION NOT NULL,
    "fittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectValuationModel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProspectSeason_userId_createdAt_idx" ON "ProspectSeason"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProspectSeason_userId_season_key" ON "ProspectSeason"("userId", "season");

-- CreateIndex
CREATE INDEX "ProspectGame_seasonId_gameDate_idx" ON "ProspectGame"("seasonId", "gameDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProspectGame_seasonId_gameDate_opponent_key" ON "ProspectGame"("seasonId", "gameDate", "opponent");

-- CreateIndex
CREATE INDEX "ProspectValuation_seasonId_computedAt_idx" ON "ProspectValuation"("seasonId", "computedAt");

-- CreateIndex
CREATE INDEX "ProspectValuationModel_fittedAt_idx" ON "ProspectValuationModel"("fittedAt");

-- AddForeignKey
ALTER TABLE "ProspectSeason" ADD CONSTRAINT "ProspectSeason_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectGame" ADD CONSTRAINT "ProspectGame_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "ProspectSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectValuation" ADD CONSTRAINT "ProspectValuation_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "ProspectSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectValuation" ADD CONSTRAINT "ProspectValuation_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ProspectValuationModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

