import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResponseCacheService } from "../cache/response-cache.service.js";
import { ApiException } from "../common/api-exception.js";
import { AllTimeLeadersService, parseLeaderboardQuery } from "./all-time-leaders.service.js";

const FETCHED_AT = new Date("2026-10-09T12:00:00.000Z");

function makeBio(nbaPlayerId: number, firstName: string, lastName: string, isActive: boolean) {
  return {
    nbaPlayerId,
    firstName,
    lastName,
    position: null,
    heightInches: null,
    weightLbs: null,
    birthDate: null,
    school: null,
    country: null,
    fromYear: null,
    toYear: null,
    seasonExp: null,
    draftYear: null,
    draftRound: null,
    draftNumber: null,
    isGreatest75: false,
    isActive,
  };
}

describe("parseLeaderboardQuery", () => {
  it("defaults to regular-season points", () => {
    expect(parseLeaderboardQuery({})).toEqual({ category: "POINTS", seasonType: "REGULAR" });
  });

  it("accepts any case", () => {
    expect(parseLeaderboardQuery({ category: "threes_made", seasonType: "playoffs" })).toEqual({
      category: "THREES_MADE",
      seasonType: "PLAYOFFS",
    });
  });

  it("rejects a category or season type with no leaderboard", () => {
    expect(() => parseLeaderboardQuery({ category: "FG_PCT" })).toThrow(ApiException);
    // A real SeasonType, but the NBA keeps no separate Finals career totals.
    expect(() => parseLeaderboardQuery({ seasonType: "FINALS" })).toThrow(ApiException);
  });
});

describe("AllTimeLeadersService", () => {
  let allTimeLeadersService: AllTimeLeadersService;
  let findLeaders: ReturnType<typeof vi.fn>;
  let findPlayers: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    findLeaders = vi.fn().mockResolvedValue([]);
    findPlayers = vi.fn().mockResolvedValue([]);
    const prisma = { allTimeLeader: { findMany: findLeaders }, player: { findMany: findPlayers } } as never;
    allTimeLeadersService = new AllTimeLeadersService(prisma, new ResponseCacheService({ enabled: false }));
  });

  it("reads only the requested leaderboard, best first", async () => {
    await allTimeLeadersService.getLeaderboard({ category: "ASSISTS", seasonType: "PLAYOFFS" });

    const query = findLeaders.mock.calls[0][0];
    expect(query.where).toEqual({ category: "ASSISTS", seasonType: "PLAYOFFS" });
    expect(query.orderBy[0]).toEqual({ rank: "asc" });
  });

  it("links a leader to this app's player when it holds them, and leaves the rest unlinked", async () => {
    findLeaders.mockResolvedValue([
      { rank: 1, value: 43440, fetchedAt: FETCHED_AT, player: makeBio(2544, "LeBron", "James", true) },
      { rank: 2, value: 38387, fetchedAt: FETCHED_AT, player: makeBio(76003, "Kareem", "Abdul-Jabbar", false) },
    ]);
    findPlayers.mockResolvedValue([{ id: "player-lebron", nbaPlayerId: 2544 }]);

    const leaderboard = await allTimeLeadersService.getLeaderboard({ category: "POINTS", seasonType: "REGULAR" });

    expect(findPlayers.mock.calls[0][0].where).toEqual({ nbaPlayerId: { in: [2544, 76003] } });
    expect(leaderboard.fetchedAt).toEqual(FETCHED_AT);
    expect(leaderboard.leaders.map((leader) => [leader.rank, leader.value, leader.player.playerId])).toEqual([
      [1, 43440, "player-lebron"],
      [2, 38387, null],
    ]);
  });

  it("returns an empty board with no fetch time before the ingestion has run", async () => {
    const leaderboard = await allTimeLeadersService.getLeaderboard({ category: "POINTS", seasonType: "REGULAR" });

    expect(leaderboard).toEqual({ category: "POINTS", seasonType: "REGULAR", fetchedAt: null, leaders: [] });
    expect(findPlayers).not.toHaveBeenCalled();
  });
});
