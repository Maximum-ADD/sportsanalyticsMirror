import { describe, expect, it } from "vitest";
import { PUBLISHED_GAME_FILTER, UNPUBLISHED_BATCH_STATUSES } from "./game-visibility.js";

describe("PUBLISHED_GAME_FILTER", () => {
  it("blocks a game whose only batch is PENDING_REVIEW", () => {
    expect(UNPUBLISHED_BATCH_STATUSES).toContain("PENDING_REVIEW");
  });

  it("blocks every non-terminal or non-approved batch status", () => {
    expect(UNPUBLISHED_BATCH_STATUSES.sort()).toEqual(["FAILED", "PENDING_REVIEW", "REJECTED", "RUNNING"].sort());
  });

  it("never lists COMPLETED as blocking", () => {
    expect(UNPUBLISHED_BATCH_STATUSES).not.toContain("COMPLETED");
  });

  it("shapes a Prisma game relation filter that excludes soft-deleted batches from the block check", () => {
    expect(PUBLISHED_GAME_FILTER).toEqual({
      ingestionBatches: {
        none: { status: { in: UNPUBLISHED_BATCH_STATUSES }, deletedAt: null },
      },
    });
  });
});
