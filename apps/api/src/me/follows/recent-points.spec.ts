import { describe, expect, it } from "vitest";
import { takeRecentPointsByPlayerId, type PlayerGamePointsRow } from "./recent-points.js";

const RECENT_GAMES_COUNT_UNDER_TEST = 3;

function createStatRow(
  playerId: string,
  gameId: string,
  points: number,
  gameDate: string
): PlayerGamePointsRow {
  return { playerId, gameId, points, game: { gameDate: new Date(gameDate) } };
}

describe("takeRecentPointsByPlayerId", () => {
  it("keeps each player's rows separate", () => {
    const recentPointsByPlayerId = takeRecentPointsByPlayerId(
      [
        createStatRow("player-1", "game-3", 30, "2026-01-03"),
        createStatRow("player-2", "game-3", 12, "2026-01-03"),
        createStatRow("player-1", "game-2", 20, "2026-01-02"),
      ],
      RECENT_GAMES_COUNT_UNDER_TEST
    );

    expect(recentPointsByPlayerId.get("player-1")?.map((game) => game.points)).toEqual([30, 20]);
    expect(recentPointsByPlayerId.get("player-2")?.map((game) => game.points)).toEqual([12]);
  });

  it("keeps only the first N rows per player, preserving the order it was given", () => {
    const recentPointsByPlayerId = takeRecentPointsByPlayerId(
      [
        createStatRow("player-1", "game-5", 50, "2026-01-05"),
        createStatRow("player-1", "game-4", 40, "2026-01-04"),
        createStatRow("player-1", "game-3", 30, "2026-01-03"),
        createStatRow("player-1", "game-2", 20, "2026-01-02"),
        createStatRow("player-1", "game-1", 10, "2026-01-01"),
      ],
      RECENT_GAMES_COUNT_UNDER_TEST
    );

    expect(recentPointsByPlayerId.get("player-1")).toEqual([
      { gameId: "game-5", gameDate: new Date("2026-01-05"), points: 50 },
      { gameId: "game-4", gameDate: new Date("2026-01-04"), points: 40 },
      { gameId: "game-3", gameDate: new Date("2026-01-03"), points: 30 },
    ]);
  });

  // One player having played far more games than another must not eat into the
  // other's allowance - the cap is per player, not across the whole result.
  it("gives every player its own allowance of N", () => {
    const busyPlayerRows = [5, 4, 3, 2, 1].map((day) =>
      createStatRow("player-1", `game-${day}`, day, `2026-01-0${day}`)
    );
    const recentPointsByPlayerId = takeRecentPointsByPlayerId(
      [...busyPlayerRows, createStatRow("player-2", "game-x", 9, "2026-01-01")],
      RECENT_GAMES_COUNT_UNDER_TEST
    );

    expect(recentPointsByPlayerId.get("player-1")).toHaveLength(RECENT_GAMES_COUNT_UNDER_TEST);
    expect(recentPointsByPlayerId.get("player-2")).toHaveLength(1);
  });

  it("omits a player with no rows rather than returning an empty entry", () => {
    const recentPointsByPlayerId = takeRecentPointsByPlayerId([], RECENT_GAMES_COUNT_UNDER_TEST);

    expect(recentPointsByPlayerId.size).toBe(0);
    expect(recentPointsByPlayerId.get("player-1")).toBeUndefined();
  });

  it("projects each row down to gameId, gameDate and points", () => {
    const recentPointsByPlayerId = takeRecentPointsByPlayerId(
      [createStatRow("player-1", "game-1", 27, "2026-02-14")],
      RECENT_GAMES_COUNT_UNDER_TEST
    );

    expect(recentPointsByPlayerId.get("player-1")?.[0]).toEqual({
      gameId: "game-1",
      gameDate: new Date("2026-02-14"),
      points: 27,
    });
  });
});
