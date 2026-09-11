import type { Game, Team } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GamesService } from "./games.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";

const HOME_TEAM = { id: "team-home" } as Team;
const AWAY_TEAM = { id: "team-away" } as Team;

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "game-1",
    nbaGameId: "MOCK-GAME-1",
    gameDate: new Date("2026-01-01"),
    season: "2025-26",
    homeTeamId: HOME_TEAM.id,
    awayTeamId: AWAY_TEAM.id,
    homeScore: 100,
    awayScore: 98,
    ...overrides,
  };
}

describe("GamesService", () => {
  let prisma: { game: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> } };
  let gamesService: GamesService;

  beforeEach(() => {
    prisma = { game: { findMany: vi.fn(), count: vi.fn() } };
    gamesService = new GamesService(prisma as unknown as PrismaService);
  });

  it("lists soonest-upcoming games before most-recently-completed games, not by plain gameDate order", async () => {
    // A completed game dated further in the "past" than an upcoming game's
    // schedule date is still meant to appear FIRST among completed games,
    // and the soonest upcoming game should appear before a later one — a
    // plain "gameDate desc" order would instead put the far-future
    // upcoming game at the very top, which is the bug this test guards.
    const soonestUpcoming = makeGame({
      id: "upcoming-soon",
      gameDate: new Date("2026-10-20"),
      homeScore: null,
      awayScore: null,
    });
    const laterUpcoming = makeGame({
      id: "upcoming-later",
      gameDate: new Date("2027-03-01"),
      homeScore: null,
      awayScore: null,
    });
    const mostRecentCompleted = makeGame({ id: "completed-recent", gameDate: new Date("2026-06-01") });
    const olderCompleted = makeGame({ id: "completed-older", gameDate: new Date("2026-01-01") });

    prisma.game.findMany.mockImplementation(({ where }: { where: { homeScore: unknown } }) => {
      if (where.homeScore === null) return Promise.resolve([soonestUpcoming, laterUpcoming]);
      return Promise.resolve([mostRecentCompleted, olderCompleted]);
    });
    prisma.game.count.mockResolvedValue(4);

    const result = await gamesService.getGames({ pageSize: 4 });

    expect(result.data.map((game) => game.id)).toEqual([
      "upcoming-soon",
      "upcoming-later",
      "completed-recent",
      "completed-older",
    ]);
  });

  it("paginates the merged upcoming+completed list correctly across the group boundary", async () => {
    const upcoming = [makeGame({ id: "u1", homeScore: null, awayScore: null })];
    const completed = [
      makeGame({ id: "c1" }),
      makeGame({ id: "c2" }),
      makeGame({ id: "c3" }),
    ];
    prisma.game.findMany.mockImplementation(({ where }: { where: { homeScore: unknown } }) => {
      if (where.homeScore === null) return Promise.resolve(upcoming);
      return Promise.resolve(completed);
    });
    prisma.game.count.mockResolvedValue(4);

    const page1 = await gamesService.getGames({ page: 1, pageSize: 2 });
    expect(page1.data.map((game) => game.id)).toEqual(["u1", "c1"]);

    const page2 = await gamesService.getGames({ page: 2, pageSize: 2 });
    expect(page2.data.map((game) => game.id)).toEqual(["c2", "c3"]);
  });

  it("status=completed skips the upcoming query entirely and orders most-recent-first", async () => {
    const completed = [makeGame({ id: "c1", gameDate: new Date("2026-06-01") })];
    prisma.game.findMany.mockResolvedValue(completed);
    prisma.game.count.mockResolvedValue(1);

    const result = await gamesService.getGames({ status: "completed", pageSize: 10 });

    expect(result.data.map((game) => game.id)).toEqual(["c1"]);
    expect(prisma.game.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.game.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { homeScore: { not: null } },
        orderBy: [{ gameDate: "desc" }, { id: "asc" }],
      })
    );
  });

  it("status=upcoming skips the completed query entirely and orders soonest-first", async () => {
    const upcoming = [makeGame({ id: "u1", homeScore: null, awayScore: null, gameDate: new Date("2026-10-20") })];
    prisma.game.findMany.mockResolvedValue(upcoming);
    prisma.game.count.mockResolvedValue(1);

    const result = await gamesService.getGames({ status: "upcoming", pageSize: 10 });

    expect(result.data.map((game) => game.id)).toEqual(["u1"]);
    expect(prisma.game.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.game.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { homeScore: null }, orderBy: [{ gameDate: "asc" }, { id: "asc" }] })
    );
  });

  it("breaks ties on gameDate deterministically by id — regression test for the 'keeps changing' bug", async () => {
    // Many real games share the exact same gameDate (every game on one
    // calendar day stores the same timestamp) — orderBy must include a
    // tiebreaker or Postgres can return tied rows in a different order on
    // each call, even with no underlying data change. This test only
    // verifies the query SHAPE carries the tiebreaker (a mock can't itself
    // prove Postgres's tie-breaking behavior) — see the real bug this
    // guards against in games.service.ts's own doc comment.
    prisma.game.findMany.mockResolvedValue([]);
    prisma.game.count.mockResolvedValue(0);

    await gamesService.getGames({ pageSize: 10 });

    for (const call of prisma.game.findMany.mock.calls) {
      const orderBy = call[0].orderBy;
      expect(Array.isArray(orderBy)).toBe(true);
      expect(orderBy[orderBy.length - 1]).toEqual({ id: "asc" });
    }
  });

  it("scopes every query to the requested season when ?season= is given", async () => {
    prisma.game.findMany.mockResolvedValue([]);
    prisma.game.count.mockResolvedValue(0);

    await gamesService.getGames({ season: "2024-25", pageSize: 10 });

    for (const call of prisma.game.findMany.mock.calls) {
      expect(call[0].where.season).toBe("2024-25");
    }
    expect(prisma.game.count).toHaveBeenCalledWith({ where: { season: "2024-25" } });
  });

  it("getSeasons returns distinct seasons most-recent first", async () => {
    prisma.game.findMany.mockResolvedValue([{ season: "2026-27" }, { season: "2025-26" }, { season: "2024-25" }]);

    const seasons = await gamesService.getSeasons();

    expect(seasons).toEqual(["2026-27", "2025-26", "2024-25"]);
    expect(prisma.game.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ distinct: ["season"], orderBy: { season: "desc" } })
    );
  });
});
