import { beforeEach, describe, expect, it, vi } from "vitest";
import { parsePlayerFilters, PlayersService } from "./players.service.js";
import { ResponseCacheService } from "../cache/response-cache.service.js";
import { ApiException } from "../common/api-exception.js";
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

describe("parsePlayerFilters", () => {
  it("reads the list filters, folding the search and ignoring empty values", () => {
    expect(parsePlayerFilters({ teamId: "team-1", position: "", search: " Mañón ", page: "2", sort: "ppg" })).toEqual({
      teamId: "team-1",
      position: undefined,
      searchTerms: ["manon"],
      participatedIn: undefined,
    });
  });

  it("turns participated=true into the segment a player must have appeared in", () => {
    expect(parsePlayerFilters({ participated: "true", seasonType: "PLAYOFFS" }).participatedIn).toBe("PLAYOFFS");
    expect(parsePlayerFilters({ participated: "true" }).participatedIn).toBe("REGULAR");
    expect(parsePlayerFilters({ seasonType: "PLAYOFFS" }).participatedIn).toBeUndefined();
  });

  it("still rejects an unknown seasonType", () => {
    expect(() => parsePlayerFilters({ seasonType: "playoffs" })).toThrow(ApiException);
  });
});

// "Searching manon should find Mañón." The where clause can't fold accents
// in SQL (see player-name-search.ts), so the name match runs on a first read
// of the candidates' names and the list query gets the matching ids.
describe("PlayersService name search ignores accents", () => {
  let prisma: { player: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> } };
  let playersService: PlayersService;

  beforeEach(() => {
    prisma = { player: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) } };
    playersService = new PlayersService(prisma as unknown as PrismaService, new ResponseCacheService({ enabled: false }));
  });

  function givenCandidates(candidates: { id: string; firstName: string; lastName: string }[]) {
    prisma.player.findMany.mockResolvedValueOnce(candidates);
  }

  it('finds "Mañón" when the search is "manon"', async () => {
    givenCandidates([
      { id: "player-manon", firstName: "Juan", lastName: "Mañón" },
      { id: "player-james", firstName: "LeBron", lastName: "James" },
    ]);

    await playersService.getPlayers({ search: "manon" });

    expect(prisma.player.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: { in: ["player-manon"] } } })
    );
    expect(prisma.player.count).toHaveBeenCalledWith({ where: { id: { in: ["player-manon"] } } });
  });

  it('finds "Manon" when the search is "Mañón"', async () => {
    givenCandidates([{ id: "player-plain", firstName: "Juan", lastName: "Manon" }]);

    const where = await playersService.buildPlayerWhere({ search: "Mañón" });

    expect(where).toEqual({ id: { in: ["player-plain"] } });
  });

  it("looks for names only among the players who pass the other filters", async () => {
    givenCandidates([{ id: "player-manon", firstName: "Juan", lastName: "Mañón" }]);

    const where = await playersService.buildPlayerWhere({
      search: "manon",
      teamId: "team-1",
      position: "G",
      participated: "true",
      seasonType: "PLAYOFFS",
    });

    const otherFilters = {
      teamId: "team-1",
      position: "G",
      gameStats: { some: { game: { seasonType: "PLAYOFFS" } } },
    };
    expect(prisma.player.findMany).toHaveBeenCalledWith({
      where: otherFilters,
      select: { id: true, firstName: true, lastName: true },
    });
    expect(where).toEqual({ ...otherFilters, id: { in: ["player-manon"] } });
  });

  it("skips the name read entirely when there is no search", async () => {
    const where = await playersService.buildPlayerWhere({ teamId: "team-1", search: "  " });

    expect(where).toEqual({ teamId: "team-1" });
    expect(prisma.player.findMany).not.toHaveBeenCalled();
  });

  it("applies the same matching to the unpaginated read behind the ranking and the export", async () => {
    givenCandidates([
      { id: "player-manon", firstName: "Juan", lastName: "Mañón" },
      { id: "player-james", firstName: "LeBron", lastName: "James" },
    ]);

    await playersService.getMatchingPlayers({ search: "MANON" }, 10);

    expect(prisma.player.findMany).toHaveBeenLastCalledWith({
      where: { id: { in: ["player-manon"] } },
      include: { team: true },
      orderBy: { lastName: "asc" },
      take: 10,
    });
  });
});
