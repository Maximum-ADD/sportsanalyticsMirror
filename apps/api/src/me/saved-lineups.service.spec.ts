import type { Player } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiException } from "../common/api-exception.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import {
  assertMeetsSolverConstraints,
  deriveLineupDrift,
  SavedLineupsService,
  type SaveLineupInput,
} from "./saved-lineups.service.js";

const BUDGET = 50_000;

function makePlayer(id: string, position: string): Player {
  return {
    id,
    nbaPlayerId: id.length,
    firstName: "Test",
    lastName: `Player${id}`,
    position,
    heightInches: null,
    weightLbs: null,
    jerseyNumber: null,
    headshotUrl: null,
    teamId: null,
    birthDate: null,
    school: null,
    country: null,
    lastAffiliation: null,
    seasonExp: null,
    rosterStatus: null,
    draftYear: null,
    draftRound: null,
    draftNumber: null,
  };
}

function makeSlot(playerId: string, overrides: Partial<SaveLineupInput["slots"][number]> = {}) {
  return { playerId, predictedPointsAtSave: 30, salaryAtSave: 9_000, ...overrides };
}

function makeInput(slots: SaveLineupInput["slots"], budget = BUDGET): SaveLineupInput {
  return { budget, slots };
}

// A solver-legal board: two guards, two forwards, one center.
const LEGAL_POSITIONS = ["G", "G", "F", "F", "C"];
const LEGAL_SLOTS = LEGAL_POSITIONS.map((_, index) => makeSlot(`player-${index}`));

function playersByIds(ids: string[], positions = LEGAL_POSITIONS): Map<string, Player> {
  return new Map(ids.map((id, index) => [id, makePlayer(id, positions[index])]));
}

// ApiException stores its message in the response envelope, not Error.message
// (that's just "Api Exception"), so message assertions go through
// getResponse() — the same { error: { code, message } } shape clients see.
function thrownError(closure: () => unknown): unknown {
  try {
    closure();
  } catch (error) {
    return error;
  }
  throw new Error("expected the closure to throw");
}

function expectInvalidLineupError(error: unknown, messagePattern: RegExp): void {
  expect(error).toBeInstanceOf(ApiException);
  expect((error as ApiException).getResponse()).toEqual({
    error: { code: "INVALID_LINEUP", message: expect.stringMatching(messagePattern) },
  });
}

describe("assertMeetsSolverConstraints", () => {
  it("accepts a board that meets every solver constraint", () => {
    const playersById = playersByIds(LEGAL_SLOTS.map((slot) => slot.playerId));
    expect(() => assertMeetsSolverConstraints(makeInput(LEGAL_SLOTS), playersById)).not.toThrow();
  });

  it("counts a combo guard-forward toward both minimums, like the solver's substring test", () => {
    // "G-F" contains both "G" and "F" — exactly how optimize.py counts it.
    const playersById = playersByIds(
      ["combo", "pure-g", "pure-f", "center", "wing"],
      ["G-F", "G", "F", "C", "F"]
    );
    const slots = ["combo", "pure-g", "pure-f", "center", "wing"].map((id) => makeSlot(id));
    expect(() => assertMeetsSolverConstraints(makeInput(slots), playersById)).not.toThrow();
  });

  it("rejects a board that doesn't have exactly 5 players", () => {
    const playersById = playersByIds(["a", "b", "c", "d"]);
    const error = thrownError(() =>
      assertMeetsSolverConstraints(makeInput(["a", "b", "c", "d"].map((id) => makeSlot(id))), playersById)
    );
    expectInvalidLineupError(error, /exactly 5 players/);
  });

  it("rejects a board with the same player twice", () => {
    const ids = ["a", "a", "b", "c", "d"];
    const playersById = playersByIds(ids, ["G", "G", "F", "F", "C"]);
    const error = thrownError(() => assertMeetsSolverConstraints(makeInput(ids.map((id) => makeSlot(id))), playersById));
    expectInvalidLineupError(error, /appears more than once/);
  });

  it("rejects a board referencing a player that doesn't exist", () => {
    const playersById = playersByIds(LEGAL_SLOTS.map((slot) => slot.playerId));
    playersById.delete("player-4");
    const error = thrownError(() => assertMeetsSolverConstraints(makeInput(LEGAL_SLOTS), playersById));
    expectInvalidLineupError(error, /doesn't exist/);
  });

  it("rejects a board with no guard", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const playersById = playersByIds(ids, ["F", "F", "F", "C", "C"]);
    const error = thrownError(() => assertMeetsSolverConstraints(makeInput(ids.map((id) => makeSlot(id))), playersById));
    expectInvalidLineupError(error, /at least 1 guard/);
  });

  it("rejects a board with no forward", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const playersById = playersByIds(ids, ["G", "G", "G", "C", "C"]);
    const error = thrownError(() => assertMeetsSolverConstraints(makeInput(ids.map((id) => makeSlot(id))), playersById));
    expectInvalidLineupError(error, /at least 1 forward/);
  });

  it("rejects a board whose salary is over the cap, naming the overshoot", () => {
    const playersById = playersByIds(LEGAL_SLOTS.map((slot) => slot.playerId));
    const slots = LEGAL_SLOTS.map((slot) => makeSlot(slot.playerId, { salaryAtSave: 12_000 }));
    const error = thrownError(() => assertMeetsSolverConstraints(makeInput(slots, BUDGET), playersById));
    expectInvalidLineupError(error, /\$10,000 over the \$50,000 cap/);
  });
});

describe("deriveLineupDrift", () => {
  const savedLineup = {
    budget: BUDGET,
    slots: [
      makeSlot("a", { predictedPointsAtSave: 40, salaryAtSave: 10_000 }),
      makeSlot("b", { predictedPointsAtSave: 35.5, salaryAtSave: 9_500 }),
    ],
  };

  it("reports latest-minus-frozen deltas and the over-cap flag", () => {
    const latest = new Map([
      ["a", { playerId: "a", predictedFantasyPoints: 42.3, salary: 11_000 }],
      ["b", { playerId: "b", predictedFantasyPoints: 33, salary: 9_000 }],
    ]);

    expect(deriveLineupDrift(savedLineup, latest)).toEqual({
      pointsDelta: -0.2,
      salaryDelta: 500,
      isOverBudget: false,
    });
  });

  it("flags the lineup as over budget when the current salary exceeds the saved budget", () => {
    const latest = new Map([
      ["a", { playerId: "a", predictedFantasyPoints: 40, salary: 30_000 }],
      ["b", { playerId: "b", predictedFantasyPoints: 35.5, salary: 25_000 }],
    ]);

    expect(deriveLineupDrift(savedLineup, latest)!.isOverBudget).toBe(true);
  });

  it("returns null instead of inventing deltas when a player has no current prediction", () => {
    const latest = new Map([["a", { playerId: "a", predictedFantasyPoints: 42.3, salary: 11_000 }]]);

    expect(deriveLineupDrift(savedLineup, latest)).toBeNull();
  });
});

describe("SavedLineupsService", () => {
  let prisma: {
    savedLineup: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
    player: { findMany: ReturnType<typeof vi.fn> };
    playerPrediction: { findMany: ReturnType<typeof vi.fn> };
  };
  let service: SavedLineupsService;

  beforeEach(() => {
    prisma = {
      savedLineup: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
      player: { findMany: vi.fn() },
      playerPrediction: { findMany: vi.fn() },
    };
    service = new SavedLineupsService(prisma as unknown as PrismaService);
  });

  describe("saveLineup", () => {
    it("creates the lineup with each slot's frozen values verbatim", async () => {
      prisma.player.findMany.mockResolvedValue(LEGAL_SLOTS.map((slot, index) => makePlayer(slot.playerId, LEGAL_POSITIONS[index])));
      prisma.savedLineup.create.mockResolvedValue({
        id: "saved-1",
        userId: "user-1",
        budget: BUDGET,
        createdAt: new Date("2026-09-12T10:00:00Z"),
        slots: LEGAL_SLOTS.map((slot, index) => ({
          id: `slot-${index}`,
          savedLineupId: "saved-1",
          playerId: slot.playerId,
          predictedPointsAtSave: slot.predictedPointsAtSave,
          salaryAtSave: slot.salaryAtSave,
          player: makePlayer(slot.playerId, LEGAL_POSITIONS[index]),
        })),
      });
      prisma.playerPrediction.findMany.mockResolvedValue([]);

      const input = makeInput(LEGAL_SLOTS);
      const saved = await service.saveLineup("user-1", input);

      expect(prisma.savedLineup.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          budget: BUDGET,
          slots: { create: input.slots },
        },
        include: { slots: { include: { player: { include: { team: true } } } } },
      });
      expect(saved.id).toBe("saved-1");
      expect(saved.slots.map((slot) => slot.salaryAtSave)).toEqual(input.slots.map((slot) => slot.salaryAtSave));
      expect(saved.drift).toBeNull();
    });

    it("never writes when the board breaks a solver constraint", async () => {
      // Five forwards: legal size, but no guard.
      prisma.player.findMany.mockResolvedValue(LEGAL_SLOTS.map((slot) => makePlayer(slot.playerId, "F")));

      await expect(service.saveLineup("user-1", makeInput(LEGAL_SLOTS))).rejects.toThrow(ApiException);
      expect(prisma.savedLineup.create).not.toHaveBeenCalled();
    });
  });

  describe("listSavedLineups", () => {
    it("scopes to the user, newest first, with players embedded", async () => {
      prisma.savedLineup.findMany.mockResolvedValue([]);
      prisma.playerPrediction.findMany.mockResolvedValue([]);

      await service.listSavedLineups("user-7");

      expect(prisma.savedLineup.findMany).toHaveBeenCalledWith({
        where: { userId: "user-7" },
        orderBy: { createdAt: "desc" },
        include: { slots: { include: { player: { include: { team: true } } } } },
      });
    });

    it("skips the predictions query entirely when the user has no saved lineups", async () => {
      prisma.savedLineup.findMany.mockResolvedValue([]);

      await service.listSavedLineups("user-7");

      expect(prisma.playerPrediction.findMany).not.toHaveBeenCalled();
    });

    it("attaches each slot's latest prediction and derives drift from it", async () => {
      const frozenSlots = LEGAL_SLOTS.map((slot, index) => ({
        id: `slot-${index}`,
        savedLineupId: "saved-1",
        playerId: slot.playerId,
        predictedPointsAtSave: 30,
        salaryAtSave: 9_000,
        player: makePlayer(slot.playerId, LEGAL_POSITIONS[index]),
      }));
      prisma.savedLineup.findMany.mockResolvedValue([
        { id: "saved-1", userId: "user-1", budget: BUDGET, createdAt: new Date("2026-09-12T10:00:00Z"), slots: frozenSlots },
      ]);
      prisma.playerPrediction.findMany.mockResolvedValue(
        LEGAL_SLOTS.map((slot, index) => ({
          id: `pred-${index}`,
          playerId: slot.playerId,
          predictedFantasyPoints: 31.2,
          salary: 9_200,
          asOf: new Date("2026-09-12T12:00:00Z"),
        }))
      );

      const [saved] = await service.listSavedLineups("user-1");

      expect(saved.totalPredictedPointsAtSave).toBe(150);
      expect(saved.totalSalaryAtSave).toBe(45_000);
      expect(saved.slots[0].currentPredictedFantasyPoints).toBe(31.2);
      expect(saved.drift).toEqual({ pointsDelta: 6, salaryDelta: 1_000, isOverBudget: false });
    });

    it("takes only the newest prediction per player when several exist", async () => {
      const frozenSlots = [
        {
          id: "slot-0",
          savedLineupId: "saved-1",
          playerId: "a",
          predictedPointsAtSave: 30,
          salaryAtSave: 9_000,
          player: makePlayer("a", "G"),
        },
      ];
      prisma.savedLineup.findMany.mockResolvedValue([
        { id: "saved-1", userId: "user-1", budget: BUDGET, createdAt: new Date(), slots: frozenSlots },
      ]);
      // findMany is ordered asOf desc by the query itself, so the mock must
      // return rows newest-first, the way Postgres would.
      prisma.playerPrediction.findMany.mockResolvedValue([
        { id: "new", playerId: "a", predictedFantasyPoints: 33, salary: 9_900, asOf: new Date("2026-09-12T00:00:00Z") },
        { id: "old", playerId: "a", predictedFantasyPoints: 10, salary: 5_000, asOf: new Date("2026-09-10T00:00:00Z") },
      ]);

      const [saved] = await service.listSavedLineups("user-1");

      expect(saved.slots[0].currentPredictedFantasyPoints).toBe(33);
      expect(saved.drift!.pointsDelta).toBe(3);
    });
  });

  describe("deleteSavedLineup", () => {
    it("scopes the delete to the owning user so it is idempotent and cannot touch another user's row", async () => {
      await service.deleteSavedLineup("user-1", "saved-1");

      expect(prisma.savedLineup.deleteMany).toHaveBeenCalledWith({ where: { id: "saved-1", userId: "user-1" } });
    });
  });
});
