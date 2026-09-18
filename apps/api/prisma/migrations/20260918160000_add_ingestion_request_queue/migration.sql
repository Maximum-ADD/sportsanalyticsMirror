-- Queue for pulls the API cannot run itself. The deployed API cannot reach
-- stats.nba.com (cloud IP ranges are blocked), so it records requests here
-- and a pull worker on a machine that can reach it runs them.
-- See apps/ingestion/pull_worker.py.

-- CreateEnum
CREATE TYPE "IngestionRequestStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "IngestionRequest" (
    "id" TEXT NOT NULL,
    "status" "IngestionRequestStatus" NOT NULL DEFAULT 'QUEUED',
    "season" TEXT,
    "fromDate" TEXT,
    "toDate" TEXT,
    "scheduled" BOOLEAN NOT NULL DEFAULT false,
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedBy" TEXT,
    "claimedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "message" TEXT,

    CONSTRAINT "IngestionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionWorker" (
    "name" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionWorker_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "IngestionRequest_status_requestedAt_idx" ON "IngestionRequest"("status", "requestedAt");

-- AddForeignKey
ALTER TABLE "IngestionRequest" ADD CONSTRAINT "IngestionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
