import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAnomaliesService } from "./admin-anomalies.service.js";

const VALID_STAT_FIELDS = {
  points: 20,
  rebounds: 5,
  assists: 5,
  steals: 1,
  blocks: 1,
  turnovers: 2,
  fieldGoalsMade: 8,
  fieldGoalsAttempted: 14,
  threesMade: 2,
  threesAttempted: 5,
  freeThrowsMade: 2,
  freeThrowsAttempted: 2,
  offensiveRebounds: 1,
  defensiveRebounds: 4,
  minutes: 30,
  usagePercentage: 25,
};

function makeStat(overrides: Record<string, unknown> = {}) {
  return {
    id: "stat-1",
    playerId: "player-1",
    gameId: "game-1",
    game: { season: "2025-26" },
    player: { firstName: "Steph", lastName: "Curry" },
    ...VALID_STAT_FIELDS,
    ...overrides,
  };
}

function priorGame(points: number) {
  return { playerId: "player-1", points, rebounds: 5, assists: 5, steals: 1, blocks: 1, turnovers: 2 };
}

function createMockPrisma() {
  return {
    playerGameStat: {
      findMany: vi.fn(),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
  } as any;
}

describe("AdminAnomaliesService", () => {
  let service: AdminAnomaliesService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AdminAnomaliesService(prisma);
  });

  it("returns nothing for a game with no stat rows", async () => {
    prisma.playerGameStat.findMany.mockResolvedValueOnce([]);

    const result = await service.listAnomaliesForGame("game-1");

    expect(result).toEqual([]);
    // Never queries prior games when there's nothing to compare — an empty
    // game, not a 1 + N scan.
    expect(prisma.playerGameStat.findMany).toHaveBeenCalledTimes(1);
  });

  it("is silent on a clean line with a consistent history", async () => {
    prisma.playerGameStat.findMany
      .mockResolvedValueOnce([makeStat()])
      .mockResolvedValueOnce([priorGame(18), priorGame(19), priorGame(20), priorGame(21), priorGame(22)]);

    const result = await service.listAnomaliesForGame("game-1");

    expect(result).toEqual([]);
  });

  it("flags an impossible-value row even with no history to compare against", async () => {
    prisma.playerGameStat.findMany
      .mockResolvedValueOnce([makeStat({ fieldGoalsMade: 15, fieldGoalsAttempted: 14 })])
      .mockResolvedValueOnce([]);

    const result = await service.listAnomaliesForGame("game-1");

    expect(result).toHaveLength(1);
    expect(result[0].findings.map((f) => f.code)).toContain("FIELD_GOALS_MADE_EXCEEDS_ATTEMPTED");
    expect(result[0].outliers).toEqual([]);
  });

  it("flags a historical outlier separately from sanity-check findings", async () => {
    // A career night, but internally consistent (24/30 shooting, all
    // twos, no misses: 24*2 + 0 FT = 48... use a split that nets exactly
    // 60 so findStatAnomalies has nothing of its own to say).
    const careerNightStat = makeStat({
      points: 60,
      fieldGoalsMade: 24,
      fieldGoalsAttempted: 30,
      threesMade: 4,
      threesAttempted: 8,
      freeThrowsMade: 8,
      freeThrowsAttempted: 8,
    });
    prisma.playerGameStat.findMany
      .mockResolvedValueOnce([careerNightStat])
      .mockResolvedValueOnce([priorGame(18), priorGame(19), priorGame(20), priorGame(21), priorGame(22), priorGame(19)]);

    const result = await service.listAnomaliesForGame("game-1");

    expect(result).toHaveLength(1);
    expect(result[0].findings).toEqual([]);
    expect(result[0].outliers.map((o) => o.field)).toContain("points");
    expect(result[0].playerName).toBe("Steph Curry");
  });

  it("scopes the prior-games query to the same season, excluding this game", async () => {
    prisma.playerGameStat.findMany.mockResolvedValueOnce([makeStat()]).mockResolvedValueOnce([]);

    await service.listAnomaliesForGame("game-1");

    expect(prisma.playerGameStat.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { playerId: { in: ["player-1"] }, game: { season: "2025-26", id: { not: "game-1" } } },
      })
    );
  });

  it("batches the prior-games lookup into one query for every player in the game", async () => {
    prisma.playerGameStat.findMany
      .mockResolvedValueOnce([
        makeStat({ id: "stat-1", playerId: "player-1" }),
        makeStat({ id: "stat-2", playerId: "player-2", player: { firstName: "Klay", lastName: "Thompson" } }),
      ])
      .mockResolvedValueOnce([]);

    await service.listAnomaliesForGame("game-1");

    // One findMany for the game's own rows, one for every player's prior
    // games combined — never one per player.
    expect(prisma.playerGameStat.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.playerGameStat.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: expect.objectContaining({ playerId: { in: ["player-1", "player-2"] } }) })
    );
  });
});
