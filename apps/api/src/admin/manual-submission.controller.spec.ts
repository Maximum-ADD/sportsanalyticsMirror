import { describe, expect, it, vi } from "vitest";
import { ManualSubmissionController } from "./manual-submission.controller.js";

// Same reason admin-batches.controller.spec.ts mocks this: the session
// guard imports auth.config, which builds a real PrismaClient at import
// time, and nothing here needs real auth.
vi.mock("../auth/auth.config.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

function createMockService() {
  return {
    submitGameEvents: vi.fn().mockResolvedValue({
      batchId: "batch-1",
      status: "PENDING_REVIEW",
      eventsAccepted: 1,
      playersWithStats: 1,
    }),
  };
}

describe("ManualSubmissionController", () => {
  it("passes the game id, submitter id and raw body straight to the service", async () => {
    const service = createMockService();
    const controller = new ManualSubmissionController(service);
    const body = { events: [], minutesByPlayerId: {} };

    await controller.submitEvents("game-1", body, { user: { id: "analyst-1" } });

    expect(service.submitGameEvents).toHaveBeenCalledWith("game-1", "analyst-1", body);
  });

  it("returns whatever the service resolves", async () => {
    const service = createMockService();
    const controller = new ManualSubmissionController(service);

    await expect(controller.submitEvents("game-1", {}, { user: { id: "analyst-1" } })).resolves.toEqual({
      batchId: "batch-1",
      status: "PENDING_REVIEW",
      eventsAccepted: 1,
      playersWithStats: 1,
    });
  });
});
