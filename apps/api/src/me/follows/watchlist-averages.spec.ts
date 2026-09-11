import type { PlayerGameStat } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { PlayersService } from "../../players/players.service.js";
import { StatsService } from "../../players/stats.service.js";
import {
  buildAveragesByPlayerId,
  deriveAveragesFromTotals,
  EMPTY_SEASON_AVERAGES,
  type PlayerStatTotalsRow,
} from "./watchlist-averages.js";

// A full PlayerGameStat row carrying the three columns this comparison cares
// about; every other counting stat is zeroed, since StatsService averages them
// independently and they cannot affect points/rebounds/assists.
function createBoxscoreRow(
  index: number,
  scoringLine: { points: number; rebounds: number; assists: number }
): PlayerGameStat {
  return {
    id: `stat-${index}`,
    playerId: "player-1",
    gameId: `game-${index}`,
    minutes: 30,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    threesMade: 0,
    threesAttempted: 0,
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
    ...scoringLine,
  };
}

function createTotalsRow(overrides: Partial<PlayerStatTotalsRow> = {}): PlayerStatTotalsRow {
  return {
    playerId: overrides.playerId ?? "player-1",
    _count: overrides._count ?? { _all: 4 },
    _sum: overrides._sum ?? { points: 100, rebounds: 30, assists: 22 },
  };
}

describe("deriveAveragesFromTotals", () => {
  it("divides each season total by the games it came from", () => {
    const averages = deriveAveragesFromTotals(
      createTotalsRow({ _count: { _all: 4 }, _sum: { points: 100, rebounds: 30, assists: 22 } })
    );

    expect(averages).toEqual({
      gamesPlayed: 4,
      pointsPerGame: 25,
      reboundsPerGame: 7.5,
      assistsPerGame: 5.5,
    });
  });

  it("rounds to one decimal place", () => {
    const averages = deriveAveragesFromTotals(
      createTotalsRow({ _count: { _all: 3 }, _sum: { points: 100, rebounds: 10, assists: 5 } })
    );

    expect(averages.pointsPerGame).toBe(33.3);
    expect(averages.reboundsPerGame).toBe(3.3);
    expect(averages.assistsPerGame).toBe(1.7);
  });

  it("treats a null SUM as zero, since Postgres sums nothing to null", () => {
    const averages = deriveAveragesFromTotals(
      createTotalsRow({ _count: { _all: 2 }, _sum: { points: null, rebounds: null, assists: null } })
    );

    expect(averages).toEqual({ gamesPlayed: 2, pointsPerGame: 0, reboundsPerGame: 0, assistsPerGame: 0 });
  });

  it("returns zeroes rather than NaN when there are no games at all", () => {
    const averages = deriveAveragesFromTotals(
      createTotalsRow({ _count: { _all: 0 }, _sum: { points: null, rebounds: null, assists: null } })
    );

    expect(averages).toEqual(EMPTY_SEASON_AVERAGES);
    expect(Number.isNaN(averages.pointsPerGame)).toBe(false);
  });

  // The whole reason the watchlist aggregates in Postgres instead of looping
  // StatsService is performance - it must not also change the numbers. A
  // player's PPG has to read identically on the watchlist and on their profile.
  it("produces exactly what StatsService.deriveSeasonAverages does for the same games", () => {
    const gameStats = [
      { points: 31, rebounds: 7, assists: 9 },
      { points: 24, rebounds: 11, assists: 4 },
      { points: 18, rebounds: 6, assists: 7 },
    ];
    const statsService = new StatsService({} as unknown as PlayersService);
    const profileAverages = statsService.deriveSeasonAverages(
      gameStats.map((gameStat, index) => createBoxscoreRow(index, gameStat))
    );

    const watchlistAverages = deriveAveragesFromTotals({
      playerId: "player-1",
      _count: { _all: gameStats.length },
      _sum: {
        points: gameStats.reduce((total, gameStat) => total + gameStat.points, 0),
        rebounds: gameStats.reduce((total, gameStat) => total + gameStat.rebounds, 0),
        assists: gameStats.reduce((total, gameStat) => total + gameStat.assists, 0),
      },
    });

    expect(watchlistAverages.gamesPlayed).toBe(profileAverages.gamesPlayed);
    expect(watchlistAverages.pointsPerGame).toBe(profileAverages.pointsPerGame);
    expect(watchlistAverages.reboundsPerGame).toBe(profileAverages.reboundsPerGame);
    expect(watchlistAverages.assistsPerGame).toBe(profileAverages.assistsPerGame);
  });
});

describe("buildAveragesByPlayerId", () => {
  it("indexes every groupBy row by its playerId", () => {
    const averagesByPlayerId = buildAveragesByPlayerId([
      createTotalsRow({ playerId: "player-1", _count: { _all: 2 }, _sum: { points: 40, rebounds: 10, assists: 6 } }),
      createTotalsRow({ playerId: "player-2", _count: { _all: 5 }, _sum: { points: 50, rebounds: 25, assists: 15 } }),
    ]);

    expect(averagesByPlayerId.get("player-1")?.pointsPerGame).toBe(20);
    expect(averagesByPlayerId.get("player-2")?.pointsPerGame).toBe(10);
  });

  // A followed player with no boxscore rows produces no groupBy row at all;
  // the map must simply not contain them, so the caller can fall back.
  it("omits players that had no rows to aggregate", () => {
    const averagesByPlayerId = buildAveragesByPlayerId([createTotalsRow({ playerId: "player-1" })]);

    expect(averagesByPlayerId.has("player-2")).toBe(false);
    expect(averagesByPlayerId.size).toBe(1);
  });

  it("returns an empty map for an empty aggregate", () => {
    expect(buildAveragesByPlayerId([]).size).toBe(0);
  });
});
