-- Become Pro: self-reported prospect seasons, their per-game box scores, the
-- evidence uploaded to verify them, and the valuations apps/valuation writes.
--
-- Authored with `prisma migrate dev --create-only`. Two statements Prisma
-- emitted alongside these were removed by hand: a DROP INDEX on
-- IngestionBatch_reviewedById_idx and a DROP DEFAULT on
-- IngestionSchedule.updatedAt. Neither is part of this change — both came
-- from drift between the committed schema and the local dev database, and
-- shipping them here would have made this migration silently alter the
-- ingestion tables on every other environment.

-- CreateEnum
CREATE TYPE "CompetitionLevel" AS ENUM ('NCAA_D1', 'NCAA_D2', 'NCAA_D3', 'NAIA', 'JUCO', 'INTERNATIONAL_PRO', 'SEMI_PRO', 'HIGH_SCHOOL', 'REC');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateTable
CREATE TABLE "ProspectSeason" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "competitionLevel" "CompetitionLevel" NOT NULL,
    "position" TEXT NOT NULL,
    "teamName" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
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
    "evidenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectEvidence" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "objectPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "EvidenceStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectEvidence_pkey" PRIMARY KEY ("id")
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

    CONSTRAINT "ProspectValuation_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "ProspectEvidence_status_uploadedAt_idx" ON "ProspectEvidence"("status", "uploadedAt");

-- CreateIndex
CREATE INDEX "ProspectEvidence_seasonId_idx" ON "ProspectEvidence"("seasonId");

-- CreateIndex
CREATE INDEX "ProspectValuation_seasonId_computedAt_idx" ON "ProspectValuation"("seasonId", "computedAt");

-- AddForeignKey
ALTER TABLE "ProspectSeason" ADD CONSTRAINT "ProspectSeason_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectGame" ADD CONSTRAINT "ProspectGame_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "ProspectSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectGame" ADD CONSTRAINT "ProspectGame_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "ProspectEvidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectEvidence" ADD CONSTRAINT "ProspectEvidence_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "ProspectSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectEvidence" ADD CONSTRAINT "ProspectEvidence_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectValuation" ADD CONSTRAINT "ProspectValuation_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "ProspectSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;
