import { beforeEach, describe, expect, it, vi } from "vitest";
import { ManualSubmissionService } from "./manual-submission.service.js";

const GAME_ID = "game-1";
const SUBMITTER_ID = "analyst-1";
const HOME_TEAM = "home-team";
const AWAY_TEAM = "away-team";
const CURRY = "curry-id";

function madeTwo(overrides: Record<string, unknown> = {}) {
  return {
    sequence: 1,
    period: 1,
    clock: "PT11M30.00S",
    eventType: "2pt",
    subType: null,
    playerId: CURRY,
    teamId: HOME_TEAM,
    success: true,
    value: 2,
    description: "Curry 12' Jump Shot (2 PTS)",
    ...overrides,
  };
}

function createMockPrisma() {
  const transactionClient = {
    gameEvent: {
      count: vi.fn().mockResolvedValue(0),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    ingestionBatch: { create: vi.fn().mockResolvedValue({ id: "batch-1" }) },
    playerGameStat: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  return {
    game: {
      findUnique: vi.fn().mockResolvedValue({ id: GAME_ID, homeTeamId: HOME_TEAM, awayTeamId: AWAY_TEAM }),
    },
    player: {
      findMany: vi.fn().mockResolvedValue([{ id: CURRY, teamId: HOME_TEAM, firstName: "Steph", lastName: "Curry" }]),
    },
    $transaction: vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback(transactionClient)),
    __transactionClient: transactionClient,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
  } as any;
}

describe("ManualSubmissionService", () => {
  let service: ManualSubmissionService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ManualSubmissionService(prisma);
  });

  it("throws 404 when the game does not exist", async () => {
    prisma.game.findUnique.mockResolvedValue(null);

    await expect(
      service.submitGameEvents(GAME_ID, SUBMITTER_ID, { events: [madeTwo()], minutesByPlayerId: { [CURRY]: 34 } }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 409 when the game already has events", async () => {
    prisma.__transactionClient.gameEvent.count.mockResolvedValue(10);

    await expect(
      service.submitGameEvents(GAME_ID, SUBMITTER_ID, { events: [madeTwo()], minutesByPlayerId: { [CURRY]: 34 } }),
    ).rejects.toMatchObject({ status: 409 });
    expect(prisma.__transactionClient.gameEvent.createMany).not.toHaveBeenCalled();
  });

  it("throws 409 (not a raw 500) when a concurrent submission wins the race and violates the unique constraint", async () => {
    // Simulates two submissions for the same empty game both passing the
    // in-transaction count check before either commits (READ COMMITTED
    // doesn't serialize that) — the losing createMany then hits
    // GameEvent's own (gameId, sequence) unique constraint instead.
    prisma.__transactionClient.gameEvent.createMany.mockRejectedValue({ code: "P2002" });

    await expect(
      service.submitGameEvents(GAME_ID, SUBMITTER_ID, { events: [madeTwo()], minutesByPlayerId: { [CURRY]: 34 } }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("propagates an unrelated transaction error unchanged", async () => {
    prisma.__transactionClient.gameEvent.createMany.mockRejectedValue(new Error("connection reset"));

    await expect(
      service.submitGameEvents(GAME_ID, SUBMITTER_ID, { events: [madeTwo()], minutesByPlayerId: { [CURRY]: 34 } }),
    ).rejects.toThrow("connection reset");
  });

  it("throws 400 on a malformed body before touching the database", async () => {
    await expect(service.submitGameEvents(GAME_ID, SUBMITTER_ID, { events: [] })).rejects.toMatchObject({ status: 400 });
    expect(prisma.game.findUnique).not.toHaveBeenCalled();
  });

  it("throws 400 when a player has an event but no minutes entry", async () => {
    await expect(
      service.submitGameEvents(GAME_ID, SUBMITTER_ID, { events: [madeTwo()], minutesByPlayerId: {} }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 when the events themselves fail validation", async () => {
    await expect(
      service.submitGameEvents(GAME_ID, SUBMITTER_ID, {
        events: [madeTwo({ playerId: "not-on-roster" })],
        minutesByPlayerId: {},
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("writes a PENDING_REVIEW batch, events and derived stats atomically", async () => {
    const result = await service.submitGameEvents(GAME_ID, SUBMITTER_ID, {
      events: [madeTwo()],
      minutesByPlayerId: { [CURRY]: 34 },
    });

    const tx = prisma.__transactionClient;
    expect(tx.ingestionBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gameId: GAME_ID,
          source: "human",
          status: "PENDING_REVIEW",
          submittedById: SUBMITTER_ID,
          eventsAccepted: 1,
        }),
      }),
    );
    expect(tx.gameEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ gameId: GAME_ID, batchId: "batch-1", sequence: 1, eventType: "2pt" })],
      }),
    );
    expect(tx.playerGameStat.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ playerId: CURRY, gameId: GAME_ID, minutes: 34, points: 2 })],
      }),
    );
    expect(result).toEqual({ batchId: "batch-1", status: "PENDING_REVIEW", eventsAccepted: 1, playersWithStats: 1 });
  });

  it("writes a zero stat line for a player given minutes but with no events of their own", async () => {
    prisma.player.findMany.mockResolvedValue([
      { id: CURRY, teamId: HOME_TEAM, firstName: "Steph", lastName: "Curry" },
      { id: "bench-player", teamId: HOME_TEAM, firstName: "Bench", lastName: "Player" },
    ]);

    await service.submitGameEvents(GAME_ID, SUBMITTER_ID, {
      events: [madeTwo()],
      minutesByPlayerId: { [CURRY]: 34, "bench-player": 2 },
    });

    const tx = prisma.__transactionClient;
    const benchRow = tx.playerGameStat.createMany.mock.calls[0][0].data.find(
      (row: { playerId: string }) => row.playerId === "bench-player",
    );
    expect(benchRow).toMatchObject({ minutes: 2, points: 0, rebounds: 0, assists: 0 });
  });
});
