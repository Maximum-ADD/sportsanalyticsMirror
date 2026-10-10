-- Enum for schedule frequency (must be created before the table that uses it)
CREATE TYPE "IngestionFrequency" AS ENUM ('NEVER', 'HOURLY', 'DAILY', 'WEEKLY');

-- IngestionBatch: soft-delete support
ALTER TABLE "IngestionBatch" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "IngestionBatch" ADD COLUMN "deletedById" TEXT;
ALTER TABLE "IngestionBatch" ADD CONSTRAINT "IngestionBatch_deletedById_fkey"
  FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- IngestionSchedule: singleton configuration for automated pulls
CREATE TABLE "IngestionSchedule" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "frequency" "IngestionFrequency" NOT NULL DEFAULT 'NEVER',
  "lastRunAt" TIMESTAMP(3),
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "IngestionSchedule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IngestionSchedule_updatedById_key" UNIQUE ("updatedById"),
  CONSTRAINT "IngestionSchedule_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
