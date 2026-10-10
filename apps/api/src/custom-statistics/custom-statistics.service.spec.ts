import { describe, expect, it, vi } from "vitest";
import { PUBLISHED_GAME_FILTER } from "../common/game-visibility.js";
import { CustomStatisticsService } from "./custom-statistics.service.js";

function createPrismaMock() {
  const prisma = {
    customStatistic: {
      create: vi.fn().mockResolvedValue({ id: "definition-1" }),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ id: "definition-1", version: 2 }),
    },
    customStatisticVersion: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
    },
    playerGameStat: { findMany: vi.fn() },
    // Interactive transactions run against the same mock, as the real
    // client's transaction handle exposes the same models.
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((run: (transaction: typeof prisma) => unknown) => run(prisma));
  return prisma;
}

const TWO_GAMES = [
  { points: 10, rebounds: 4, assists: 6, steals: 1, blocks: 0, turnovers: 2, minutes: 30 },
  { points: 20, rebounds: 6, assists: 4, steals: 0, blocks: 1, turnovers: 3, minutes: 32 },
];

describe("CustomStatisticsService", () => {
  it("lists, creates, and version-updates a definition for its author", async () => {
    const prisma = createPrismaMock();
    const service = new CustomStatisticsService(prisma as never);

    await service.listDefinitions("author-1");
    await service.createDefinition("author-1", "Impact", "points + assists");
    await service.updateDefinition("author-1", "definition-1", "points - turnovers");

    expect(prisma.customStatistic.findMany).toHaveBeenCalledWith({ where: { authorId: "author-1" }, orderBy: { updatedAt: "desc" } });
    expect(prisma.customStatistic.create).toHaveBeenCalledWith({
      data: {
        authorId: "author-1",
        name: "Impact",
        expression: "points + assists",
        versions: { create: { version: 1, expression: "points + assists" } },
      },
    });
    expect(prisma.customStatistic.update).toHaveBeenCalledWith({
      where: { id: "definition-1", authorId: "author-1" },
      data: { expression: "points - turnovers", version: { increment: 1 } },
    });
  });

  it("records each edit in the version history under the new version number, in the same transaction", async () => {
    const prisma = createPrismaMock();
    const service = new CustomStatisticsService(prisma as never);

    await expect(service.updateDefinition("author-1", "definition-1", "points - turnovers")).resolves.toEqual({
      id: "definition-1",
      version: 2,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.customStatisticVersion.create).toHaveBeenCalledWith({
      data: { statisticId: "definition-1", version: 2, expression: "points - turnovers" },
    });
  });

  it("rejects an unsupported expression before opening a transaction for an edit", () => {
    const prisma = createPrismaMock();
    const service = new CustomStatisticsService(prisma as never);

    expect(() => service.updateDefinition("author-1", "definition-1", "points + salary")).toThrow("unsupported statistic: salary");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("lists a definition's versions oldest first, or null when the caller does not own it", async () => {
    const prisma = createPrismaMock();
    const service = new CustomStatisticsService(prisma as never);
    const versions = [{ version: 1, expression: "points", createdAt: new Date() }];
    prisma.customStatistic.findFirst.mockResolvedValueOnce({ versions }).mockResolvedValueOnce(null);

    await expect(service.listVersions("author-1", "definition-1")).resolves.toEqual(versions);
    await expect(service.listVersions("author-1", "someone-elses")).resolves.toBeNull();
    expect(prisma.customStatistic.findFirst).toHaveBeenCalledWith({
      where: { id: "definition-1", authorId: "author-1" },
      select: { versions: { orderBy: { version: "asc" }, select: { version: true, expression: true, createdAt: true } } },
    });
  });

  it("reproduces an earlier figure by evaluating that version's expression", async () => {
    const prisma = createPrismaMock();
    prisma.customStatistic.findFirst.mockResolvedValue({ id: "definition-1", name: "Impact", version: 3, expression: "points + assists" });
    prisma.customStatisticVersion.findUnique.mockResolvedValue({ version: 1, expression: "points" });
    prisma.playerGameStat.findMany.mockResolvedValue(TWO_GAMES);
    const service = new CustomStatisticsService(prisma as never);

    await expect(service.calculateDefinition("author-1", "definition-1", "player-1", undefined, 1)).resolves.toMatchObject({
      version: 1,
      expression: "points",
      value: 15,
    });
    expect(prisma.customStatisticVersion.findUnique).toHaveBeenCalledWith({
      where: { statisticId_version: { statisticId: "definition-1", version: 1 } },
      select: { version: true, expression: true },
    });
  });

  it("returns null for a version the definition never had", async () => {
    const prisma = createPrismaMock();
    prisma.customStatistic.findFirst.mockResolvedValue({ id: "definition-1", name: "Impact", version: 2, expression: "points" });
    prisma.customStatisticVersion.findUnique.mockResolvedValue(null);
    const service = new CustomStatisticsService(prisma as never);

    await expect(service.calculateDefinition("author-1", "definition-1", "player-1", undefined, 9)).resolves.toBeNull();
    expect(prisma.playerGameStat.findMany).not.toHaveBeenCalled();
  });

  it("evaluates the current expression without a history lookup when the current version is asked for", async () => {
    const prisma = createPrismaMock();
    prisma.customStatistic.findFirst.mockResolvedValue({ id: "definition-1", name: "Impact", version: 2, expression: "points" });
    prisma.playerGameStat.findMany.mockResolvedValue(TWO_GAMES);
    const service = new CustomStatisticsService(prisma as never);

    await expect(service.calculateDefinition("author-1", "definition-1", "player-1", undefined, 2)).resolves.toMatchObject({ value: 15 });
    expect(prisma.customStatisticVersion.findUnique).not.toHaveBeenCalled();
  });

  it("rejects unsupported expressions before writing a definition", () => {
    const prisma = createPrismaMock();
    const service = new CustomStatisticsService(prisma as never);

    expect(() => service.createDefinition("author-1", "Unsafe", "points + salary")).toThrow("unsupported statistic: salary");
    expect(prisma.customStatistic.create).not.toHaveBeenCalled();
  });

  it("returns null when the caller does not own the requested definition", async () => {
    const prisma = createPrismaMock();
    prisma.customStatistic.findFirst.mockResolvedValue(null);
    const service = new CustomStatisticsService(prisma as never);

    await expect(service.calculateDefinition("author-1", "missing", "player-1")).resolves.toBeNull();
    expect(prisma.playerGameStat.findMany).not.toHaveBeenCalled();
  });

  it("calculates a statistic from per-game averages and optionally filters the season segment", async () => {
    const prisma = createPrismaMock();
    prisma.customStatistic.findFirst.mockResolvedValue({ id: "definition-1", name: "Impact", version: 3, expression: "points + assists" });
    prisma.playerGameStat.findMany.mockResolvedValue(TWO_GAMES);
    const service = new CustomStatisticsService(prisma as never);

    await expect(service.calculateDefinition("author-1", "definition-1", "player-1", "PLAYOFF" as never)).resolves.toEqual({
      definitionId: "definition-1",
      name: "Impact",
      version: 3,
      expression: "points + assists",
      playerId: "player-1",
      gamesCount: 2,
      value: 20,
    });
    expect(prisma.playerGameStat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { playerId: "player-1", game: { seasonType: "PLAYOFF", ...PUBLISHED_GAME_FILTER } } })
    );
  });

  it("calculates zero-valued averages when a player has no games", async () => {
    const prisma = createPrismaMock();
    prisma.customStatistic.findFirst.mockResolvedValue({ id: "definition-1", name: "Points", version: 1, expression: "points" });
    prisma.playerGameStat.findMany.mockResolvedValue([]);
    const service = new CustomStatisticsService(prisma as never);

    await expect(service.calculateDefinition("author-1", "definition-1", "player-1")).resolves.toMatchObject({ gamesCount: 0, value: 0 });
    expect(prisma.playerGameStat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { playerId: "player-1", game: PUBLISHED_GAME_FILTER } })
    );
  });
});
