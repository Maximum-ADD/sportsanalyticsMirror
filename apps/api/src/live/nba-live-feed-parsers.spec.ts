import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LiveFeedUnavailableError } from "./live-feed-unavailable.error.js";
import { parseBoxScore, parsePlayByPlay, parseSchedule, parseScoreboard } from "./nba-live-feed-parsers.js";

// The fixtures are trimmed copies of the real CDN files, captured on
// 2026-10-06 (LAL 127 @ SAC 103, a preseason final). Recapture them if the
// NBA changes its format: these specs are what will notice.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readFixture(fileName: string): any {
  return JSON.parse(readFileSync(new URL(`./fixtures/${fileName}`, import.meta.url), "utf8"));
}

describe("parseSchedule", () => {
  it("slims each game to its id, season type, UTC start and teams", () => {
    const [lakersAtWarriors, ...otherGames] = parseSchedule(readFixture("schedule.json"));

    expect(lakersAtWarriors).toEqual({
      gameId: "0012600010",
      seasonType: "Preseason",
      startsAt: "2026-10-07T02:00:00Z",
      statusNote: null,
      homeTeam: { teamId: 1610612744, tricode: "GSW", city: "Golden State", name: "Warriors" },
      awayTeam: { teamId: 1610612747, tricode: "LAL", city: "Los Angeles", name: "Lakers" },
    });
    expect(otherGames.map((game) => [game.gameId, game.startsAt, game.awayTeam.tricode, game.homeTeam.tricode])).toEqual([
      ["0012600025", "2026-10-06T23:00:00Z", "BKN", "CHA"],
      ["0012600029", "2026-10-07T23:00:00Z", "MIN", "IND"],
    ]);
  });

  it("leaves out placeholder games whose teams aren't known yet, like the NBA Cup final", () => {
    const gameIds = parseSchedule(readFixture("schedule.json")).map((game) => game.gameId);

    expect(gameIds).not.toContain("0062600001");
  });

  it.each([
    ["a tip-off time", { gameStatusText: "7:00 pm ET" }, null],
    ["an unknown time", { gameStatusText: "TBD" }, "TBD"],
    ["a postponement", { gameStatusText: "PPD   ", postponedStatus: "Y" }, "PPD"],
    ["a postponement with no text", { gameStatusText: "", postponedStatus: "Y" }, "Postponed"],
    ["a finished game", { gameStatus: 3, gameStatusText: "Final               " }, null],
  ])("notes the status of a game with %s only when it isn't on track", (_label, statusFields, expectedNote) => {
    const schedule = readFixture("schedule.json");
    Object.assign(schedule.leagueSchedule.gameDates[0].games[0], statusFields);

    expect(parseSchedule(schedule)[0].statusNote).toBe(expectedNote);
  });

  it("rejects a schedule whose structure has changed", () => {
    expect(() => parseSchedule({ schedule: [] })).toThrow(LiveFeedUnavailableError);
  });

  it("rejects a schedule in which no game has the expected fields", () => {
    const schedule = readFixture("schedule.json");
    for (const gameDate of schedule.leagueSchedule.gameDates) {
      for (const game of gameDate.games) delete game.gameDateTimeUTC;
    }

    expect(() => parseSchedule(schedule)).toThrow(/schedule.*gameDateTimeUTC/);
  });
});

describe("parseScoreboard", () => {
  it("reads today's games into the schedule's shape", () => {
    const [, pelicansAtThunder] = parseScoreboard(readFixture("scoreboard.json"));

    expect(pelicansAtThunder).toEqual({
      gameId: "0012600026",
      seasonType: "Preseason",
      startsAt: "2026-10-07T00:00:00Z",
      statusNote: null,
      homeTeam: { teamId: 1610612760, tricode: "OKC", city: "Oklahoma City", name: "Thunder" },
      awayTeam: { teamId: 1610612740, tricode: "NOP", city: "New Orleans", name: "Pelicans" },
    });
  });

  it("notes a scoreboard status that isn't a tip-off time", () => {
    const scoreboard = readFixture("scoreboard.json");
    scoreboard.scoreboard.games[0].gameStatusText = "PPD";

    expect(parseScoreboard(scoreboard)[0].statusNote).toBe("PPD");
  });

  it("accepts a day with no games", () => {
    expect(parseScoreboard({ scoreboard: { games: [] } })).toEqual([]);
  });
});

describe("parseBoxScore", () => {
  it("reads a final game's state, teams and score", () => {
    const boxScore = parseBoxScore(readFixture("boxscore-final.json"));

    expect(boxScore).toMatchObject({
      gameId: "0012600028",
      seasonType: "Preseason",
      status: "final",
      statusText: "Final",
      period: 4,
      regulationPeriods: 4,
      gameClock: "PT00M00.00S",
      startsAt: "2026-10-06T02:00:00Z",
      homeTeam: { teamId: 1610612758, tricode: "SAC", city: "Sacramento", name: "Kings", score: 103 },
      awayTeam: { teamId: 1610612747, tricode: "LAL", city: "Los Angeles", name: "Lakers", score: 127 },
    });
  });

  it("maps each player's line, turning the feed's '1'/'0' flags into booleans", () => {
    const [starter, benchPlayer, didNotPlay] = parseBoxScore(readFixture("boxscore-final.json"))!.homeTeam.players;

    expect(starter).toEqual({
      personId: 1629631,
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
    });
    expect(benchPlayer).toMatchObject({ shortName: "D. Cardwell", position: null, isStarter: false, hasPlayed: true, rebounds: 10 });
    expect(didNotPlay).toMatchObject({ shortName: "M. Monk", hasPlayed: false });
  });

  it("returns null for a game that hasn't tipped off, without checking the rest", () => {
    expect(parseBoxScore({ game: { gameStatus: 1 } })).toBeNull();
  });

  it("reads a live game, and an empty clock between periods as no clock", () => {
    const payload = readFixture("boxscore-final.json");
    Object.assign(payload.game, { gameStatus: 2, gameStatusText: "Half", period: 2, gameClock: "" });

    expect(parseBoxScore(payload)).toMatchObject({ status: "live", statusText: "Half", period: 2, gameClock: null });
  });

  it("names the season type from the game id, and leaves an unknown prefix unnamed", () => {
    const payload = readFixture("boxscore-final.json");
    payload.game.gameId = "0042500401";
    expect(parseBoxScore(payload)?.seasonType).toBe("Playoffs");

    payload.game.gameId = "0092500401";
    expect(parseBoxScore(payload)?.seasonType).toBeNull();
  });

  it.each([
    ["an unknown game status", (game: Record<string, unknown>) => (game.gameStatus = 4)],
    ["a missing score", (game: { homeTeam: Record<string, unknown> }) => delete game.homeTeam.score],
    ["a malformed game id", (game: Record<string, unknown>) => (game.gameId = "../../etc")],
  ])("rejects a box score with %s", (_label, breakGame) => {
    const payload = readFixture("boxscore-final.json");
    breakGame(payload.game);

    expect(() => parseBoxScore(payload)).toThrow(LiveFeedUnavailableError);
  });

  it("drops a malformed player but keeps the rest of the team", () => {
    const payload = readFixture("boxscore-final.json");
    delete payload.game.homeTeam.players[1].statistics;

    expect(parseBoxScore(payload)!.homeTeam.players.map((player) => player.shortName)).toEqual(["D. Hunter", "M. Monk"]);
  });
});

describe("parsePlayByPlay", () => {
  it("takes the game's end time from its Game End action", () => {
    expect(parsePlayByPlay(readFixture("playbyplay-final.json")).endedAt).toBe("2026-10-06T04:42:50.769Z");
  });

  it("maps each play, with scores as numbers and made shots marked as scoring", () => {
    const plays = parsePlayByPlay(readFixture("playbyplay-final.json")).plays;
    const putback = plays.find((play) => play.actionNumber === 786);
    const miss = plays.find((play) => play.actionNumber === 784);
    const periodStart = plays[0];

    expect(putback).toEqual({
      actionNumber: 786,
      orderNumber: 510350351,
      period: 4,
      clock: "PT00M00.10S",
      teamTricode: "SAC",
      description: "N. Clifford 7' putback Layup (23 PTS)",
      homeScore: 103,
      awayScore: 127,
      isScoringPlay: true,
    });
    expect(miss?.isScoringPlay).toBe(false);
    expect(periodStart).toMatchObject({ teamTricode: null, description: "Period Start", isScoringPlay: false });
  });

  it("has no end time while the game is still going", () => {
    const payload = readFixture("playbyplay-final.json");
    payload.game.actions = payload.game.actions.filter((action: { actionType: string }) => action.actionType !== "game");

    expect(parsePlayByPlay(payload).endedAt).toBeNull();
  });

  it("drops a malformed play, and gives one without a description an empty one", () => {
    const payload = readFixture("playbyplay-final.json");
    delete payload.game.actions[1].period;
    delete payload.game.actions[2].description;

    const plays = parsePlayByPlay(payload).plays;

    expect(plays).toHaveLength(10);
    expect(plays.find((play) => play.actionNumber === 779)?.description).toBe("");
  });

  it("rejects a play-by-play whose structure has changed", () => {
    expect(() => parsePlayByPlay({ game: { plays: [] } })).toThrow(LiveFeedUnavailableError);
  });
});
