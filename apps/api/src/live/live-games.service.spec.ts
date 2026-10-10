import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResponseCacheService } from "../cache/response-cache.service.js";
import { LiveFeedUnavailableError } from "./live-feed-unavailable.error.js";
import { LiveGamesService } from "./live-games.service.js";
import type { NbaLiveFeed } from "./nba-live-feed.js";
import type { LiveBoxScore, LivePlay, LivePlayerLine, LivePlayByPlay, ScheduledGame } from "./nba-live-feed-parsers.js";

// 21:00 SAST: the evening after a night of games, with the next night's
// games still ahead.
const NOW = new Date("2026-10-06T19:00:00Z");
const SECOND_IN_MILLISECONDS = 1000;
const MINUTE_IN_MILLISECONDS = 60 * SECOND_IN_MILLISECONDS;
const HOUR_IN_MILLISECONDS = 60 * MINUTE_IN_MILLISECONDS;

function hoursFromNow(hours: number): string {
  return new Date(NOW.getTime() + hours * HOUR_IN_MILLISECONDS).toISOString();
}

function hoursBeforeNow(hours: number): string {
  return hoursFromNow(-hours);
}

function buildScheduledGame(gameId: string, startsAt: string, statusNote: string | null = null): ScheduledGame {
  return {
    gameId,
    seasonType: "Preseason",
    startsAt,
    statusNote,
    homeTeam: { teamId: 1610612758, tricode: "SAC", city: "Sacramento", name: "Kings" },
    awayTeam: { teamId: 1610612747, tricode: "LAL", city: "Los Angeles", name: "Lakers" },
  };
}

function buildPlayer(overrides: Partial<LivePlayerLine> = {}): LivePlayerLine {
  return {
    personId: 1,
    name: "De'Andre Hunter",
    shortName: "D. Hunter",
    jerseyNumber: "15",
    position: "SF",
    isStarter: true,
    hasPlayed: true,
    minutes: "PT13M27.00S",
    points: 3,
    assists: 0,
    rebounds: 0,
    turnovers: 0,
    steals: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    threePointersMade: 0,
    threePointersAttempted: 0,
    freeThrowsMade: 3,
    freeThrowsAttempted: 3,
    plusMinus: -16,
    ...overrides,
  };
}

function buildBoxScore(gameId: string, overrides: Partial<LiveBoxScore> = {}): LiveBoxScore {
  return {
    gameId,
    seasonType: "Preseason",
    status: "final",
    statusText: "Final",
    period: 4,
    regulationPeriods: 4,
    gameClock: "PT00M00.00S",
    startsAt: hoursBeforeNow(4),
    homeTeam: { teamId: 1610612758, tricode: "SAC", city: "Sacramento", name: "Kings", score: 103, players: [buildPlayer()] },
    awayTeam: { teamId: 1610612747, tricode: "LAL", city: "Los Angeles", name: "Lakers", score: 127, players: [buildPlayer()] },
    ...overrides,
  };
}

function buildLiveBoxScore(gameId: string, startsAt: string): LiveBoxScore {
  return buildBoxScore(gameId, { status: "live", statusText: "Q3 4:12", period: 3, gameClock: "PT04M12.00S", startsAt });
}

function buildPlay(overrides: Partial<LivePlay>): LivePlay {
  return {
    actionNumber: 1,
    orderNumber: 1,
    period: 3,
    clock: "PT05M00.00S",
    teamTricode: "SAC",
    description: "N. Clifford driving Layup (21 PTS)",
    homeScore: 70,
    awayScore: 68,
    isScoringPlay: true,
    ...overrides,
  };
}

function buildPlayByPlay(endedAt: string | null, plays: LivePlay[] = []): LivePlayByPlay {
  return { plays, endedAt };
}

describe("LiveGamesService", () => {
  let feed: {
    getSchedule: ReturnType<typeof vi.fn>;
    getScoreboard: ReturnType<typeof vi.fn>;
    getBoxScore: ReturnType<typeof vi.fn>;
    getPlayByPlay: ReturnType<typeof vi.fn>;
  };
  let service: LiveGamesService;

  // Each game id maps to its box score (null: not tipped off) and play-by-play.
  function serveGames(games: Record<string, { boxScore: LiveBoxScore | null; playByPlay?: LivePlayByPlay | null }>) {
    feed.getBoxScore.mockImplementation(async (gameId: string) => games[gameId]?.boxScore ?? null);
    feed.getPlayByPlay.mockImplementation(async (gameId: string) => games[gameId]?.playByPlay ?? null);
  }

  function countBoxScoreReads(gameId: string): number {
    return feed.getBoxScore.mock.calls.filter(([calledGameId]) => calledGameId === gameId).length;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    feed = {
      getSchedule: vi.fn().mockResolvedValue([]),
      getScoreboard: vi.fn().mockResolvedValue([]),
      getBoxScore: vi.fn().mockResolvedValue(null),
      getPlayByPlay: vi.fn().mockResolvedValue(null),
    };
    // A real, enabled cache: how often the feed is read is part of the contract.
    service = new LiveGamesService(feed as unknown as NbaLiveFeed, new ResponseCacheService({ enabled: true }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getLiveGames", () => {
    it("sorts games into live, upcoming and recent", async () => {
      feed.getSchedule.mockResolvedValue([
        buildScheduledGame("0012600001", hoursBeforeNow(1)),
        buildScheduledGame("0012600002", hoursBeforeNow(5)),
        buildScheduledGame("0012600003", hoursFromNow(4)),
      ]);
      serveGames({
        "0012600001": { boxScore: buildLiveBoxScore("0012600001", hoursBeforeNow(1)) },
        "0012600002": { boxScore: buildBoxScore("0012600002"), playByPlay: buildPlayByPlay(hoursBeforeNow(2.5)) },
      });

      const board = await service.getLiveGames();

      expect(board.live.map((game) => game.gameId)).toEqual(["0012600001"]);
      expect(board.upcoming.map((game) => game.gameId)).toEqual(["0012600003"]);
      expect(board.recent.map((game) => game.gameId)).toEqual(["0012600002"]);
      expect(board.recent[0]).toMatchObject({
        status: "final",
        endedAt: hoursBeforeNow(2.5),
        seasonType: "Preseason",
        homeTeam: { tricode: "SAC", score: 103 },
        awayTeam: { tricode: "LAL", score: 127 },
      });
    });

    it("orders live games by tip-off and recent ones by most recent finish", async () => {
      feed.getSchedule.mockResolvedValue([
        buildScheduledGame("0012600001", hoursBeforeNow(1)),
        buildScheduledGame("0012600002", hoursBeforeNow(2)),
        buildScheduledGame("0012600003", hoursBeforeNow(6)),
        buildScheduledGame("0012600004", hoursBeforeNow(5)),
      ]);
      serveGames({
        "0012600001": { boxScore: buildLiveBoxScore("0012600001", hoursBeforeNow(1)) },
        "0012600002": { boxScore: buildLiveBoxScore("0012600002", hoursBeforeNow(2)) },
        "0012600003": { boxScore: buildBoxScore("0012600003"), playByPlay: buildPlayByPlay(hoursBeforeNow(3.5)) },
        "0012600004": { boxScore: buildBoxScore("0012600004"), playByPlay: buildPlayByPlay(hoursBeforeNow(2.5)) },
      });

      const board = await service.getLiveGames();

      expect(board.live.map((game) => game.gameId)).toEqual(["0012600002", "0012600001"]);
      expect(board.recent.map((game) => game.gameId)).toEqual(["0012600004", "0012600003"]);
    });

    it("keeps finished games for 18 hours after the final buzzer", async () => {
      feed.getSchedule.mockResolvedValue([
        buildScheduledGame("0012600001", hoursBeforeNow(21)),
        buildScheduledGame("0012600002", hoursBeforeNow(20)),
      ]);
      serveGames({
        "0012600001": { boxScore: buildBoxScore("0012600001"), playByPlay: buildPlayByPlay(hoursBeforeNow(18.5)) },
        "0012600002": { boxScore: buildBoxScore("0012600002"), playByPlay: buildPlayByPlay(hoursBeforeNow(17.5)) },
      });

      const { recent } = await service.getLiveGames();

      expect(recent.map((game) => game.gameId)).toEqual(["0012600002"]);
    });

    it("only reads box scores for games scheduled to start in the last 22 hours", async () => {
      feed.getSchedule.mockResolvedValue([
        buildScheduledGame("0012600001", hoursBeforeNow(23)),
        buildScheduledGame("0012600002", hoursBeforeNow(21.5)),
        buildScheduledGame("0012600003", hoursFromNow(1)),
      ]);

      await service.getLiveGames();

      expect(feed.getBoxScore.mock.calls).toEqual([["0012600002"]]);
    });

    it("lists games due within 24 hours as upcoming, soonest first, without reading them", async () => {
      feed.getSchedule.mockResolvedValue([
        buildScheduledGame("0012600001", hoursFromNow(23)),
        buildScheduledGame("0012600002", hoursFromNow(6)),
        buildScheduledGame("0012600003", hoursFromNow(25)),
      ]);

      const { upcoming } = await service.getLiveGames();

      expect(upcoming.map((game) => game.gameId)).toEqual(["0012600002", "0012600001"]);
      expect(upcoming[0]).toEqual(buildScheduledGame("0012600002", hoursFromNow(6)));
      expect(feed.getBoxScore).not.toHaveBeenCalled();
    });

    it("keeps a game that's past its start time but has no box score yet in upcoming, first", async () => {
      feed.getSchedule.mockResolvedValue([
        buildScheduledGame("0012600001", hoursFromNow(2)),
        buildScheduledGame("0012600002", hoursBeforeNow(0.2)),
      ]);
      serveGames({ "0012600002": { boxScore: null } });

      const board = await service.getLiveGames();

      expect(board.upcoming.map((game) => game.gameId)).toEqual(["0012600002", "0012600001"]);
      expect(board.live).toEqual([]);
    });

    it("passes on the schedule's status note, so a postponement shows instead of a countdown", async () => {
      feed.getSchedule.mockResolvedValue([buildScheduledGame("0012600001", hoursFromNow(3), "PPD")]);

      expect((await service.getLiveGames()).upcoming[0].statusNote).toBe("PPD");
    });

    it("lays today's scoreboard over the schedule: its start times and notes win, and its games are added", async () => {
      feed.getSchedule.mockResolvedValue([buildScheduledGame("0012600001", hoursFromNow(30))]);
      feed.getScoreboard.mockResolvedValue([
        buildScheduledGame("0012600001", hoursFromNow(5), "TBD"),
        buildScheduledGame("0012600002", hoursFromNow(6)),
      ]);

      const { upcoming } = await service.getLiveGames();

      expect(upcoming.map((game) => [game.gameId, game.statusNote])).toEqual([
        ["0012600001", "TBD"],
        ["0012600002", null],
      ]);
    });

    it("still lists the scoreboard's games when the schedule can't be read", async () => {
      feed.getSchedule.mockRejectedValue(new LiveFeedUnavailableError("schedule timed out"));
      feed.getScoreboard.mockResolvedValue([buildScheduledGame("0012600002", hoursBeforeNow(1))]);
      serveGames({ "0012600002": { boxScore: buildLiveBoxScore("0012600002", hoursBeforeNow(1)) } });

      expect((await service.getLiveGames()).live.map((game) => game.gameId)).toEqual(["0012600002"]);
    });

    it("fails when neither the schedule nor the scoreboard can be read", async () => {
      feed.getSchedule.mockRejectedValue(new LiveFeedUnavailableError("schedule refused"));
      feed.getScoreboard.mockRejectedValue(new LiveFeedUnavailableError("scoreboard refused"));

      await expect(service.getLiveGames()).rejects.toThrow("schedule refused");
    });

    it("leaves out one game whose box score can't be read", async () => {
      feed.getSchedule.mockResolvedValue([
        buildScheduledGame("0012600001", hoursBeforeNow(1)),
        buildScheduledGame("0012600002", hoursBeforeNow(1)),
      ]);
      feed.getBoxScore.mockImplementation(async (gameId: string) => {
        if (gameId === "0012600001") throw new LiveFeedUnavailableError("box score refused");
        return buildLiveBoxScore(gameId, hoursBeforeNow(1));
      });

      const board = await service.getLiveGames();

      expect(board.live.map((game) => game.gameId)).toEqual(["0012600002"]);
      expect(board.upcoming).toEqual([]);
    });

    it("fails rather than show an empty page when no game's box score can be read", async () => {
      feed.getSchedule.mockResolvedValue([buildScheduledGame("0012600001", hoursBeforeNow(1))]);
      feed.getBoxScore.mockRejectedValue(new LiveFeedUnavailableError("the NBA CDN refused the request"));

      await expect(service.getLiveGames()).rejects.toThrow(LiveFeedUnavailableError);
    });

    it("keeps a finished game whose end time can't be read, after the ones that can", async () => {
      feed.getSchedule.mockResolvedValue([
        buildScheduledGame("0012600001", hoursBeforeNow(5)),
        buildScheduledGame("0012600002", hoursBeforeNow(6)),
      ]);
      feed.getBoxScore.mockImplementation(async (gameId: string) => buildBoxScore(gameId));
      feed.getPlayByPlay.mockImplementation(async (gameId: string) => {
        if (gameId === "0012600001") throw new LiveFeedUnavailableError("play-by-play refused");
        return buildPlayByPlay(hoursBeforeNow(3));
      });

      const { recent } = await service.getLiveGames();

      expect(recent.map((game) => [game.gameId, game.endedAt])).toEqual([
        ["0012600002", hoursBeforeNow(3)],
        ["0012600001", null],
      ]);
    });
  });

  describe("caching", () => {
    it("serves every viewer from one read of each feed file", async () => {
      feed.getSchedule.mockResolvedValue([buildScheduledGame("0012600001", hoursBeforeNow(1))]);
      serveGames({ "0012600001": { boxScore: buildLiveBoxScore("0012600001", hoursBeforeNow(1)) } });

      await Promise.all([service.getLiveGames(), service.getLiveGames(), service.getLiveGames()]);
      await service.getLiveGames();

      expect(feed.getSchedule).toHaveBeenCalledTimes(1);
      expect(feed.getScoreboard).toHaveBeenCalledTimes(1);
      expect(feed.getBoxScore).toHaveBeenCalledTimes(1);
    });

    it("re-reads a live game every 10 seconds but a long-finished one only hourly", async () => {
      feed.getSchedule.mockResolvedValue([
        buildScheduledGame("0012600001", hoursBeforeNow(1)),
        buildScheduledGame("0012600002", hoursBeforeNow(5)),
      ]);
      serveGames({
        "0012600001": { boxScore: buildLiveBoxScore("0012600001", hoursBeforeNow(1)) },
        "0012600002": { boxScore: buildBoxScore("0012600002"), playByPlay: buildPlayByPlay(hoursBeforeNow(2)) },
      });

      await service.getLiveGames();
      vi.advanceTimersByTime(11 * SECOND_IN_MILLISECONDS);
      await service.getLiveGames();
      const finishedGameReadsBeforeTheHour = countBoxScoreReads("0012600002");
      vi.advanceTimersByTime(HOUR_IN_MILLISECONDS);
      await service.getLiveGames();

      expect(countBoxScoreReads("0012600001")).toBe(3);
      expect(finishedGameReadsBeforeTheHour).toBe(1);
      expect(countBoxScoreReads("0012600002")).toBe(2);
    });

    it("re-checks a game that's due to tip off every 15 seconds", async () => {
      feed.getSchedule.mockResolvedValue([buildScheduledGame("0012600001", hoursBeforeNow(0.1))]);

      await service.getLiveGames();
      vi.advanceTimersByTime(14 * SECOND_IN_MILLISECONDS);
      await service.getLiveGames();
      vi.advanceTimersByTime(2 * SECOND_IN_MILLISECONDS);
      await service.getLiveGames();

      expect(countBoxScoreReads("0012600001")).toBe(2);
    });

    it("re-reads a just-finished game's box score every minute, but its end time only once", async () => {
      const endedAt = new Date(NOW.getTime() - 5 * MINUTE_IN_MILLISECONDS).toISOString();
      feed.getSchedule.mockResolvedValue([buildScheduledGame("0012600001", hoursBeforeNow(3))]);
      serveGames({ "0012600001": { boxScore: buildBoxScore("0012600001"), playByPlay: buildPlayByPlay(endedAt) } });

      await service.getLiveGames();
      vi.advanceTimersByTime(MINUTE_IN_MILLISECONDS + 1);
      await service.getLiveGames();

      expect(feed.getBoxScore).toHaveBeenCalledTimes(2);
      expect(feed.getPlayByPlay).toHaveBeenCalledTimes(1);
    });
  });

  describe("getLiveGame", () => {
    it("returns a live game's players who have played, and its last five minutes of plays", async () => {
      const boxScore = buildLiveBoxScore("0012600001", hoursBeforeNow(1));
      boxScore.homeTeam.players = [buildPlayer({ shortName: "D. Hunter" }), buildPlayer({ shortName: "M. Monk", hasPlayed: false })];
      const latestPlay = buildPlay({ actionNumber: 300, orderNumber: 300, clock: "PT04M12.00S" });
      const playOutsideWindow = buildPlay({ actionNumber: 200, orderNumber: 200, clock: "PT10M00.00S" });
      feed.getSchedule.mockResolvedValue([buildScheduledGame("0012600001", hoursBeforeNow(1))]);
      serveGames({ "0012600001": { boxScore, playByPlay: buildPlayByPlay(null, [playOutsideWindow, latestPlay]) } });

      const detail = await service.getLiveGame("0012600001");

      expect(detail?.game).toMatchObject({ gameId: "0012600001", status: "live", gameClock: "PT04M12.00S" });
      expect(detail?.homePlayers.map((player) => player.shortName)).toEqual(["D. Hunter"]);
      expect(detail?.recentPlays).toEqual([latestPlay]);
    });

    it("returns a recent game's box score without any plays", async () => {
      feed.getSchedule.mockResolvedValue([buildScheduledGame("0012600001", hoursBeforeNow(4))]);
      serveGames({ "0012600001": { boxScore: buildBoxScore("0012600001"), playByPlay: buildPlayByPlay(hoursBeforeNow(1.5)) } });

      const detail = await service.getLiveGame("0012600001");

      expect(detail?.game.endedAt).toBe(hoursBeforeNow(1.5));
      expect(detail?.awayPlayers).toHaveLength(1);
      expect(detail?.recentPlays).toBeNull();
    });

    it("still returns a live game's box score when its play-by-play can't be read", async () => {
      feed.getSchedule.mockResolvedValue([buildScheduledGame("0012600001", hoursBeforeNow(1))]);
      serveGames({ "0012600001": { boxScore: buildLiveBoxScore("0012600001", hoursBeforeNow(1)) } });
      feed.getPlayByPlay.mockRejectedValue(new LiveFeedUnavailableError("play-by-play refused"));

      const detail = await service.getLiveGame("0012600001");

      expect(detail?.homePlayers).toHaveLength(1);
      expect(detail?.recentPlays).toBeNull();
    });

    it("returns null for an upcoming game, which has no box score yet", async () => {
      feed.getSchedule.mockResolvedValue([
        buildScheduledGame("0012600001", hoursFromNow(3)),
        buildScheduledGame("0012600002", hoursBeforeNow(0.1)),
      ]);

      await expect(service.getLiveGame("0012600001")).resolves.toBeNull();
      await expect(service.getLiveGame("0012600002")).resolves.toBeNull();
    });

    it("returns null for a game that isn't on the board, without reading it", async () => {
      feed.getSchedule.mockResolvedValue([buildScheduledGame("0012600001", hoursBeforeNow(1))]);
      serveGames({ "0012600001": { boxScore: buildLiveBoxScore("0012600001", hoursBeforeNow(1)) } });

      await expect(service.getLiveGame("0022500999")).resolves.toBeNull();
      expect(feed.getBoxScore).not.toHaveBeenCalledWith("0022500999");
    });

    it("lets a bug in the service surface instead of passing as an outage", async () => {
      feed.getSchedule.mockResolvedValue([buildScheduledGame("0012600001", hoursBeforeNow(1))]);
      serveGames({ "0012600001": { boxScore: buildLiveBoxScore("0012600001", hoursBeforeNow(1)) } });
      feed.getPlayByPlay.mockRejectedValue(new TypeError("plays is not iterable"));

      await expect(service.getLiveGame("0012600001")).rejects.toThrow(TypeError);
    });
  });
});
