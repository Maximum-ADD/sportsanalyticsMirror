import type { Request } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiException } from "../common/api-exception.js";
import { parseSaveLineupBody, SavedLineupsController } from "./saved-lineups.controller.js";
import type { SavedLineupsService } from "./saved-lineups.service.js";

function makeRequest(userId = "user-1"): Request {
  return { user: { id: userId } } as unknown as Request;
}

function catchThrown(closure: () => unknown): unknown {
  try {
    closure();
  } catch (error) {
    return error;
  }
  throw new Error("expected the closure to throw");
}

const VALID_BODY = {
  budget: 50_000,
  name: "Test lineup",
  slots: [
    { playerId: "p1", predictedPointsAtSave: 40, salaryAtSave: 10_000 },
    { playerId: "p2", predictedPointsAtSave: 35, salaryAtSave: 9_000 },
  ],
};

describe("parseSaveLineupBody", () => {
  it("accepts a well-formed body, preserving slot order", () => {
    expect(parseSaveLineupBody(VALID_BODY)).toEqual(VALID_BODY);
  });

  it.each([
    ["a non-object body", "nope"],
    ["a null body", null],
    ["a missing budget", { slots: VALID_BODY.slots }],
    ["a fractional budget", { ...VALID_BODY, budget: 50_000.5 }],
    ["a non-array slots field", { budget: 50_000, slots: "p1" }],
    ["a blank name", { ...VALID_BODY, name: "   " }],
    ["a slot without a playerId", { ...VALID_BODY, slots: [{ predictedPointsAtSave: 40, salaryAtSave: 10_000 }] }],
    ["a slot with a non-finite prediction", { ...VALID_BODY, slots: [{ playerId: "p1", predictedPointsAtSave: Number.NaN, salaryAtSave: 1 }] }],
    ["a slot with a fractional salary", { ...VALID_BODY, slots: [{ playerId: "p1", predictedPointsAtSave: 40, salaryAtSave: 10_000.5 }] }],
  ])("rejects %s with a 400", (_label, body) => {
    expect(() => parseSaveLineupBody(body)).toThrow(ApiException);
    expect(() => parseSaveLineupBody(body)).toThrowError(
      expect.objectContaining({ getStatus: expect.any(Function) })
    );
  });

  it("surfaces the malformed field in the error envelope", () => {
    // ApiException keeps its message in the response envelope, not
    // Error.message — assert the same { error: { code, message } } shape
    // an HTTP client would receive.
    const budgetError = catchThrown(() => parseSaveLineupBody({ budget: -5, slots: [] }));
    expect((budgetError as ApiException).getResponse()).toEqual({
      error: { code: "BAD_REQUEST", message: expect.stringMatching(/budget/) },
    });
    const slotError = catchThrown(() => parseSaveLineupBody({ budget: 50_000, name: "Test lineup", slots: [{ playerId: "p1" }] }));
    expect((slotError as ApiException).getResponse()).toEqual({
      error: { code: "BAD_REQUEST", message: expect.stringMatching(/predictedPointsAtSave/) },
    });
  });
});

describe("SavedLineupsController", () => {
  let savedLineupsService: {
    listSavedLineups: ReturnType<typeof vi.fn>;
    saveLineup: ReturnType<typeof vi.fn>;
    deleteSavedLineup: ReturnType<typeof vi.fn>;
  };
  let controller: SavedLineupsController;

  beforeEach(() => {
    savedLineupsService = {
      listSavedLineups: vi.fn(),
      saveLineup: vi.fn(),
      deleteSavedLineup: vi.fn(),
    };
    controller = new SavedLineupsController(savedLineupsService as unknown as SavedLineupsService);
  });

  it("lists lineups for the calling user only", async () => {
    savedLineupsService.listSavedLineups.mockResolvedValue([]);

    await controller.listSavedLineups(makeRequest("user-42"));

    expect(savedLineupsService.listSavedLineups).toHaveBeenCalledWith("user-42");
  });

  it("parses the body, then saves for the calling user", async () => {
    savedLineupsService.saveLineup.mockResolvedValue({ id: "saved-1" });

    const result = await controller.saveLineup(makeRequest("user-9"), VALID_BODY);

    expect(savedLineupsService.saveLineup).toHaveBeenCalledWith("user-9", VALID_BODY);
    expect(result).toEqual({ id: "saved-1" });
  });

  it("rejects a malformed body before the service ever sees it", async () => {
    await expect(controller.saveLineup(makeRequest(), { budget: "50k", slots: [] })).rejects.toThrow(ApiException);
    expect(savedLineupsService.saveLineup).not.toHaveBeenCalled();
  });

  it("deletes for the calling user and reports success", async () => {
    const result = await controller.deleteSavedLineup(makeRequest("user-3"), "saved-7");

    expect(savedLineupsService.deleteSavedLineup).toHaveBeenCalledWith("user-3", "saved-7");
    expect(result).toEqual({ deleted: true });
  });
});
