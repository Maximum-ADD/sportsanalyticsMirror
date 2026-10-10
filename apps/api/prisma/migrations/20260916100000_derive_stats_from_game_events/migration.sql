-- GameEvent has always had a non-unique @@index([gameId, sequence]) but
-- no unique constraint, so upsert_period_bookend_events' "ON CONFLICT DO
-- NOTHING" (apps/ingestion/games.py) has never actually conflicted on
-- anything — ids are random UUIDs, which never collide — and every
-- re-ingest of an already-ingested game has been silently duplicating its
-- two dummy PERIOD_START/PERIOD_END rows. Every existing GameEvent row is
-- one of those dummy bookends (real play-by-play ingestion starts with
-- this migration), so they're deleted here rather than deduplicated —
-- there is no real information in them to preserve, and they'll be
-- superseded by genuine per-play rows the next time apps/ingestion/
-- play_by_play.py runs against each game.
DELETE FROM "GameEvent";

-- DropIndex
DROP INDEX "GameEvent_gameId_sequence_idx";

-- CreateEnum
CREATE TYPE "IngestionBatchStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "GameEvent" ADD COLUMN     "subType" TEXT,
ADD COLUMN     "teamId" TEXT,
ADD COLUMN     "success" BOOLEAN,
ADD COLUMN     "value" INTEGER,
ADD COLUMN     "batchId" TEXT;

-- CreateTable
CREATE TABLE "IngestionBatch" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" "IngestionBatchStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "eventsAccepted" INTEGER NOT NULL DEFAULT 0,
    "eventsRejected" INTEGER NOT NULL DEFAULT 0,
    "rejectionSummary" JSONB,

    CONSTRAINT "IngestionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameEvent_gameId_sequence_key" ON "GameEvent"("gameId", "sequence");

-- CreateIndex
CREATE INDEX "IngestionBatch_gameId_idx" ON "IngestionBatch"("gameId");

-- CreateIndex
CREATE INDEX "IngestionBatch_status_idx" ON "IngestionBatch"("status");

-- AddForeignKey
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "IngestionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionBatch" ADD CONSTRAINT "IngestionBatch_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
