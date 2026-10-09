-- CreateEnum
CREATE TYPE "ExportRequestStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExportResource" AS ENUM ('PLAYERS', 'GAMES');

-- CreateTable
CREATE TABLE "ExportRequest" (
    "id" TEXT NOT NULL,
    "status" "ExportRequestStatus" NOT NULL DEFAULT 'QUEUED',
    "resource" "ExportResource" NOT NULL,
    "query" JSONB NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "message" TEXT,
    "csv" TEXT,
    "rowCount" INTEGER,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ExportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExportRequest_status_requestedAt_idx" ON "ExportRequest"("status", "requestedAt");
