-- Intermediate brief features: submission review, event corrections,
-- API consumer management, and versioned dataset releases.

-- 1. Extend IngestionBatchStatus with review states
ALTER TYPE "IngestionBatchStatus" ADD VALUE 'PENDING_REVIEW';
ALTER TYPE "IngestionBatchStatus" ADD VALUE 'REJECTED';

-- 2. Add review fields to IngestionBatch
ALTER TABLE "IngestionBatch" ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "IngestionBatch" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "IngestionBatch" ADD COLUMN "reviewNotes" TEXT;
ALTER TABLE "IngestionBatch" ADD CONSTRAINT "IngestionBatch_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "IngestionBatch_reviewedById_idx" ON "IngestionBatch"("reviewedById");

-- 3. Event correction audit trail
CREATE TABLE "EventCorrection" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "previousValues" JSONB NOT NULL,
  "newValues" JSONB NOT NULL,
  "correctedById" TEXT,
  "reason" TEXT,
  "correctedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventCorrection_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "EventCorrection" ADD CONSTRAINT "EventCorrection_gameId_fkey"
  FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventCorrection" ADD CONSTRAINT "EventCorrection_correctedById_fkey"
  FOREIGN KEY ("correctedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "EventCorrection_gameId_sequence_idx" ON "EventCorrection"("gameId", "sequence");
CREATE INDEX "EventCorrection_correctedAt_idx" ON "EventCorrection"("correctedAt");

-- 4. API consumer management
CREATE TABLE "ApiConsumer" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contactEmail" TEXT,
  "rateLimit" INTEGER NOT NULL DEFAULT 100,
  "dailyQuota" INTEGER NOT NULL DEFAULT 10000,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ApiConsumer_pkey" PRIMARY KEY ("id")
);

-- 5. API keys (SHA-256 hash only)
CREATE TABLE "ApiKey" (
  "id" TEXT NOT NULL,
  "consumerId" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "label" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_consumerId_fkey"
  FOREIGN KEY ("consumerId") REFERENCES "ApiConsumer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- 6. API usage log for rate limit/quota enforcement
CREATE TABLE "ApiUsageLog" (
  "id" TEXT NOT NULL,
  "consumerId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "calledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ApiUsageLog_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ApiUsageLog" ADD CONSTRAINT "ApiUsageLog_consumerId_fkey"
  FOREIGN KEY ("consumerId") REFERENCES "ApiConsumer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ApiUsageLog_consumerId_calledAt_idx" ON "ApiUsageLog"("consumerId", "calledAt");

-- 7. Versioned dataset releases
CREATE TABLE "DatasetRelease" (
  "id" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "season" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "gamesCount" INTEGER NOT NULL,
  "playersCount" INTEGER NOT NULL,
  "eventsCount" INTEGER NOT NULL,
  "fieldSchema" JSONB NOT NULL,
  "publishedById" TEXT,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DatasetRelease_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "DatasetRelease" ADD CONSTRAINT "DatasetRelease_publishedById_fkey"
  FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "DatasetRelease_version_key" ON "DatasetRelease"("version");
CREATE INDEX "DatasetRelease_season_idx" ON "DatasetRelease"("season");
