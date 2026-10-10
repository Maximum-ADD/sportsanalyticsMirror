import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlayersService } from "./players.service.js";
import { ResponseCacheService } from "../cache/response-cache.service.js";
import { PUBLISHED_GAME_FILTER } from "../common/game-visibility.js";
import type { PrismaService } from "../prisma/prisma.service.js";

// PlayersService had no dedicated unit spec before this file — every
// PlayerGameStat read it exposes (season stats, splits, opponent splits,
// season totals) backs the public stats API, so each one needs to actually
// exclude games still awaiting review (PUBLISHED_GAME_FILTER) rather than
// only being covered indirectly through StatsService's mocked tests.
describe("PlayersService PlayerGameStat reads exclude unpublished games", () => {
  let prisma: {
    playerGameStat: { findMany: ReturnType<typeof vi.fn>; groupBy: ReturnType<typeof vi.fn> };
  };
  let playersService: PlayersService;

  beforeEach(() => {
    prisma = { playerGameStat: { findMany: vi.fn().mockResolvedValue([]), groupBy: vi.fn().mockResolvedValue([]) } };
    playersService = new PlayersService(prisma as unknown as PrismaService, new ResponseCacheService({ enabled: false }));
  });

  it("getPlayerSeasonStats filters the joined game by PUBLISHED_GAME_FILTER", async () => {
    await playersService.getPlayerSeasonStats("player-1", "REGULAR" as never);

    expect(prisma.playerGameStat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { playerId: "player-1", game: { seasonType: "REGULAR", ...PUBLISHED_GAME_FILTER } } })
    );
  });

  it("getPlayerSeasonStatsAsOf filters the joined game by PUBLISHED_GAME_FILTER alongside the asOf cutoff", async () => {
    const asOf = new Date("2026-01-01");
    await playersService.getPlayerSeasonStatsAsOf("player-1", "REGULAR" as never, asOf);

    expect(prisma.playerGameStat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { playerId: "player-1", game: { seasonType: "REGULAR", gameDate: { lte: asOf }, ...PUBLISHED_GAME_FILTER } },
      })
    );
  });

  it("getPlayerSeasonStatsBatch applies PUBLISHED_GAME_FILTER even with no seasonType supplied", async () => {
    await playersService.getPlayerSeasonStatsBatch(["player-1", "player-2"]);

    expect(prisma.playerGameStat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { playerId: { in: ["player-1", "player-2"] }, game: PUBLISHED_GAME_FILTER } })
    );
  });

  it("getPlayerGameStatsWithOpponents filters the joined game by PUBLISHED_GAME_FILTER", async () => {
    await playersService.getPlayerGameStatsWithOpponents("player-1", "REGULAR" as never);

    expect(prisma.playerGameStat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { playerId: "player-1", game: { seasonType: "REGULAR", ...PUBLISHED_GAME_FILTER } } })
    );
  });

  it("getSeasonStatTotalsBatch filters the joined game by PUBLISHED_GAME_FILTER", async () => {
    await playersService.getSeasonStatTotalsBatch(["player-1"], "REGULAR" as never);

    expect(prisma.playerGameStat.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { playerId: { in: ["player-1"] }, game: { seasonType: "REGULAR", ...PUBLISHED_GAME_FILTER } } })
    );
  });
});
