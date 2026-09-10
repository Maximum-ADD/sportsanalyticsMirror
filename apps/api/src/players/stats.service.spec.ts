import type { Game, PlayerGameStat } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlayersService } from "./players.service.js";
import { StatsService } from "./stats.service.js";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "game-1",
    nbaGameId: "MOCK-GAME-1",
    gameDate: new Date("2025-10-15"),
    season: "2025-26",
    homeTeamId: "team-home",
    awayTeamId: "team-away",
    homeScore: 100,
    awayScore: 98,
    ...overrides,
  };
}

function makeStat(overrides: Partial<PlayerGameStat> = {}): PlayerGameStat {
  return {
    id: "stat-1",
    playerId: "player-1",
    gameId: "game-1",
    minutes: 32,
    points: 20,
    rebounds: 5,
    assists: 4,
    steals: 1,
    blocks: 1,
    turnovers: 2,
    fieldGoalsMade: 8,
    fieldGoalsAttempted: 16,
    threesMade: 2,
    threesAttempted: 5,
    freeThrowsMade: 2,
    freeThrowsAttempted: 2,
    ...overrides,
  };
}

describe("StatsService", () => {
  let statsService: StatsService;
  let playersService: PlayersService;

  beforeEach(() => {
    playersService = { getPlayerSeasonStats: vi.fn() } as unknown as PlayersService;
    statsService = new StatsService(playersService);
  });

  describe("deriveSeasonAverages", () => {
    it("returns all-zero averages for a player with no games played", () => {
      expect(statsService.deriveSeasonAverages([])).toEqual({
        gamesPlayed: 0,
        minutesPerGame: 0,
        pointsPerGame: 0,
        reboundsPerGame: 0,
        assistsPerGame: 0,
        stealsPerGame: 0,
        blocksPerGame: 0,
        turnoversPerGame: 0,
        fieldGoalsMadePerGame: 0,
        fieldGoalsAttemptedPerGame: 0,
        fieldGoalPercentage: 0,
        threesMadePerGame: 0,
        threesAttemptedPerGame: 0,
        threePointPercentage: 0,
        freeThrowsMadePerGame: 0,
        freeThrowsAttemptedPerGame: 0,
        freeThrowPercentage: 0,
      });
    });

    it("averages counting stats across games and rounds to one decimal place", () => {
      const gameStats = [makeStat({ points: 20, rebounds: 5 }), makeStat({ points: 21, rebounds: 6 })];

      const averages = statsService.deriveSeasonAverages(gameStats);

      expect(averages.gamesPlayed).toBe(2);
      expect(averages.pointsPerGame).toBe(20.5);
      expect(averages.reboundsPerGame).toBe(5.5);
    });

    it("averages per-game volume stats (minutes, attempts) alongside the counting stats", () => {
      const gameStats = [
        makeStat({ minutes: 30, freeThrowsAttempted: 4, threesAttempted: 6 }),
        makeStat({ minutes: 36, freeThrowsAttempted: 6, threesAttempted: 8 }),
      ];

      const averages = statsService.deriveSeasonAverages(gameStats);

      expect(averages.minutesPerGame).toBe(33);
      expect(averages.freeThrowsAttemptedPerGame).toBe(5);
      expect(averages.threesAttemptedPerGame).toBe(7);
    });

    it("computes shooting percentages from summed makes/attempts, not per-game averages", () => {
      const gameStats = [
        makeStat({ fieldGoalsMade: 10, fieldGoalsAttempted: 20 }),
        makeStat({ fieldGoalsMade: 5, fieldGoalsAttempted: 10 }),
      ];

      const averages = statsService.deriveSeasonAverages(gameStats);

      // 15/30 = 50%, not an average of two 50% games landing on something else by coincidence.
      expect(averages.fieldGoalPercentage).toBe(50);
    });

    it("returns 0% rather than dividing by zero when no shots were attempted", () => {
      const gameStats = [makeStat({ threesMade: 0, threesAttempted: 0 })];
      expect(statsService.deriveSeasonAverages(gameStats).threePointPercentage).toBe(0);
    });
  });

  describe("deriveGameLog", () => {
    it("sorts entries chronologically (oldest first) regardless of input order", () => {
      const newer = makeStat({ gameId: "game-newer", points: 30 });
      const older = makeStat({ gameId: "game-older", points: 10 });
      const gameStats = [
        { ...newer, game: makeGame({ id: "game-newer", gameDate: new Date("2025-11-01") }) },
        { ...older, game: makeGame({ id: "game-older", gameDate: new Date("2025-10-15") }) },
      ];

      const log = statsService.deriveGameLog(gameStats);

      expect(log.map((entry) => entry.gameId)).toEqual(["game-older", "game-newer"]);
      expect(log.map((entry) => entry.points)).toEqual([10, 30]);
    });

    it("does not mutate the array it was given", () => {
      const gameStats = [
        { ...makeStat({ gameId: "b" }), game: makeGame({ id: "b", gameDate: new Date("2025-11-01") }) },
        { ...makeStat({ gameId: "a" }), game: makeGame({ id: "a", gameDate: new Date("2025-10-15") }) },
      ];
      const original = [...gameStats];

      statsService.deriveGameLog(gameStats);

      expect(gameStats).toEqual(original);
    });
  });

  describe("getPlayerSeasonAverages", () => {
    it("delegates to PlayersService and derives averages from the result", async () => {
      vi.mocked(playersService.getPlayerSeasonStats).mockResolvedValue([makeStat({ points: 10 })] as never);

      const averages = await statsService.getPlayerSeasonAverages("player-1");

      expect(playersService.getPlayerSeasonStats).toHaveBeenCalledWith("player-1");
      expect(averages.gamesPlayed).toBe(1);
      expect(averages.pointsPerGame).toBe(10);
    });
  });

  describe("getPlayerGameLog", () => {
    it("delegates to PlayersService and derives a sorted game log", async () => {
      const stat = { ...makeStat({ gameId: "game-1", points: 15 }), game: makeGame({ gameDate: new Date("2025-10-15") }) };
      vi.mocked(playersService.getPlayerSeasonStats).mockResolvedValue([stat] as never);

      const log = await statsService.getPlayerGameLog("player-1");

      expect(log).toEqual([{ gameId: "game-1", gameDate: stat.game.gameDate, points: 15 }]);
    });
  });
});
