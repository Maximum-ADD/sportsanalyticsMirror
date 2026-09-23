import type { IngestionBatchStatus, Prisma } from "@prisma/client";

// A batch in any of these states means the game's most recent play-by-play
// submission hasn't cleared review yet: PENDING_REVIEW is awaiting an
// admin, RUNNING/FAILED are mid-ingestion or errored, REJECTED was reviewed
// and turned down. Only COMPLETED counts as published. A game with no
// batch row at all (mock seed data, or anything ingested before batch
// tracking existed) is unaffected — see PUBLISHED_GAME_FILTER.
export const UNPUBLISHED_BATCH_STATUSES: IngestionBatchStatus[] = [
  "PENDING_REVIEW",
  "RUNNING",
  "FAILED",
  "REJECTED",
];

// Spread into a Game where clause (or a `game:` relation filter on
// GameEvent/PlayerGameStat) to exclude a game whose latest ingestion batch
// hasn't been approved — the brief's "submissions should pass a review
// before publication" requirement. Re-ingesting an already-published game
// reassigns every current event to the new batch (see
// apps/ingestion/play_by_play.py's upsert_game_event), so at most one batch
// row is ever the one actually behind a game's current events; "no batch in
// a blocking status" and "the latest batch is COMPLETED" agree in practice.
export const PUBLISHED_GAME_FILTER: Prisma.GameWhereInput = {
  ingestionBatches: {
    none: { status: { in: UNPUBLISHED_BATCH_STATUSES }, deletedAt: null },
  },
};
