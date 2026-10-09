import { HttpStatus } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiException } from "../common/api-exception.js";
import { SALARY_CAP_IN_DOLLARS } from "./lineup-rules.js";
import { OptimizerController } from "./optimizer.controller.js";
import type { OptimizerService } from "./optimizer.service.js";

// The controller's session guard imports auth.config, which builds a real
// PrismaClient at import time. Nothing here needs real auth.
vi.mock("../auth/auth.config.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

async function rejectionOf(promise: Promise<unknown>): Promise<ApiException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiException) return error;
    throw error;
  }
  throw new Error("expected the call to reject");
}

describe("OptimizerController.solveLineups", () => {
  let optimizerService: { solveLineups: ReturnType<typeof vi.fn> };
  let controller: OptimizerController;

  beforeEach(() => {
    optimizerService = { solveLineups: vi.fn().mockResolvedValue({ lineups: [] }) };
    controller = new OptimizerController(optimizerService as unknown as OptimizerService);
  });

  it("solves the default board for an empty body: the full cap, no locks, no exclusions", async () => {
    await controller.solveLineups({});

    expect(optimizerService.solveLineups).toHaveBeenCalledWith({
      budget: SALARY_CAP_IN_DOLLARS,
      lockedPlayerIds: [],
      excludedPlayerIds: [],
      lineupCount: 1,
    });
  });

  it("treats a missing body the same as an empty one", async () => {
    await controller.solveLineups(undefined);

    expect(optimizerService.solveLineups).toHaveBeenCalledWith(
      expect.objectContaining({ budget: SALARY_CAP_IN_DOLLARS, lockedPlayerIds: [], excludedPlayerIds: [] })
    );
  });

  it("passes the caller's budget, locks and exclusions through to the service", async () => {
    await controller.solveLineups({ budget: 45_000, lockedPlayerIds: ["p1", "p2"], excludedPlayerIds: ["p3"] });

    expect(optimizerService.solveLineups).toHaveBeenCalledWith({
      budget: 45_000,
      lockedPlayerIds: ["p1", "p2"],
      excludedPlayerIds: ["p3"],
      lineupCount: 1,
    });
  });

  // Six locks can't fit a five-player lineup, but that's the solver's to
  // explain in plain words, not a schema error.
  it("accepts more locks than a lineup has slots, so the solver can explain the problem", async () => {
    const lockedPlayerIds = ["p1", "p2", "p3", "p4", "p5", "p6"];

    await controller.solveLineups({ lockedPlayerIds });

    expect(optimizerService.solveLineups).toHaveBeenCalledWith(expect.objectContaining({ lockedPlayerIds }));
  });

  it.each([
    ["a fractional budget", { budget: 50_000.5 }],
    ["a zero budget", { budget: 0 }],
    ["a budget above the request bound", { budget: 1_000_001 }],
    ["a budget sent as a string", { budget: "50000" }],
    ["a non-array lockedPlayerIds", { lockedPlayerIds: "p1" }],
    ["a blank player id", { excludedPlayerIds: [""] }],
    ["more than 50 excluded players", { excludedPlayerIds: Array.from({ length: 51 }, (_, index) => `p${index}`) }],
    ["a non-object body", "lock p1"],
  ])("rejects %s with a 400 BAD_REQUEST before solving", async (_label, body) => {
    const error = await rejectionOf(controller.solveLineups(body));

    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(error.getResponse()).toMatchObject({ error: { code: "BAD_REQUEST" } });
    expect(optimizerService.solveLineups).not.toHaveBeenCalled();
  });
});
